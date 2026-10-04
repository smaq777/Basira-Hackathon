import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

// Hand-authored vectors test SQL plumbing only, never Arabic semantic quality.
export function validateQuerySpace(vector, space) {
  assert.equal(space.taskType, 'search_query', 'Query task must be search_query');
  assert.equal(vector.length, space.dimensions, 'Query dimensions do not match space');
  assert(vector.every(Number.isFinite), 'Query vector must contain finite numbers');
  assert(
    vector.some((value) => value !== 0),
    'Cosine query cannot be a zero vector',
  );
  assert(space.modelId && space.corpusVersion, 'Model and corpus identities are required');
  return `[${vector.join(',')}]`;
}

const candidates = `
  with fixtures(id, text, approval, revoked, model_id, dimensions, task_type,
                corpus_version, embedding) as (values
    ('lexical_hit', 'synthetic retrieval target', 'approved', false,
      'synthetic-v1', 3, 'search_document', 'synthetic-corpus-v1', '[0.8,0.6,0]'::vector),
    ('vector_hit', 'different wording', 'approved', false,
      'synthetic-v1', 3, 'search_document', 'synthetic-corpus-v1', '[1,0,0]'::vector),
    ('orthogonal', 'unrelated fixture', 'approved', false,
      'synthetic-v1', 3, 'search_document', 'synthetic-corpus-v1', '[0,1,0]'::vector),
    ('pending', 'synthetic retrieval target', 'pending', false,
      'synthetic-v1', 3, 'search_document', 'synthetic-corpus-v1', '[1,0,0]'::vector),
    ('revoked', 'synthetic retrieval target', 'approved', true,
      'synthetic-v1', 3, 'search_document', 'synthetic-corpus-v1', '[1,0,0]'::vector),
    ('wrong_model', 'synthetic retrieval target', 'approved', false,
      'other-model', 3, 'search_document', 'synthetic-corpus-v1', '[1,0,0]'::vector),
    ('wrong_task', 'synthetic retrieval target', 'approved', false,
      'synthetic-v1', 3, 'classification', 'synthetic-corpus-v1', '[1,0,0]'::vector),
    ('wrong_corpus', 'synthetic retrieval target', 'approved', false,
      'synthetic-v1', 3, 'search_document', 'other-corpus', '[1,0,0]'::vector),
    ('wrong_dimensions', 'synthetic retrieval target', 'approved', false,
      'synthetic-v1', 2, 'search_document', 'synthetic-corpus-v1', '[1,0]'::vector)
  ), eligible as materialized (
    select * from fixtures where approval='approved' and not revoked
      and model_id=$2 and dimensions=$3 and vector_dims(embedding)=$3
      and task_type='search_document' and corpus_version=$4
  )`;

export async function verifyVectorRetrieval(client) {
  const space = {
    modelId: 'synthetic-v1',
    dimensions: 3,
    taskType: 'search_query',
    corpusVersion: 'synthetic-corpus-v1',
  };
  const vector = validateQuerySpace([1, 0, 0], space);
  const parameters = [vector, space.modelId, space.dimensions, space.corpusVersion];
  await client.query('begin read only');
  try {
    await client.query("set local statement_timeout='10s'");
    const baseline =
      await client.query(`select current_setting('server_version') as postgres_version,
      (select extversion from pg_extension where extname='vector') as vector_version,
      (select extversion from pg_extension where extname='pg_trgm') as trgm_version`);
    assert(baseline.rows[0].vector_version, 'pgvector is required; this script never installs it');
    assert(baseline.rows[0].trgm_version, 'pg_trgm is required');
    const semantic = await client.query(
      `${candidates}
      select id, embedding <=> $1::vector as distance from eligible
      order by distance asc, id asc limit 5`,
      parameters,
    );
    assert.deepEqual(
      semantic.rows.map((row) => row.id),
      ['vector_hit', 'lexical_hit', 'orthogonal'],
    );
    assert.equal(semantic.rows[0].distance, 0);
    assert(Math.abs(semantic.rows[1].distance - 0.2) < 0.00001);
    assert.equal(semantic.rows[2].distance, 1);
    const lexical = await client.query(
      `${candidates}
      select id, similarity(text, $5::text) as similarity from eligible
      where $1::vector is not null order by similarity desc, id asc limit 5`,
      [...parameters, 'synthetic retrieval target'],
    );
    assert.equal(lexical.rows[0].id, 'lexical_hit');
    assert.equal(lexical.rows[0].similarity, 1);
    const changedSpace = await client.query(
      `${candidates}
      select count(*)::int as count from eligible where $1::vector is not null`,
      [vector, 'unknown-model', 3, space.corpusVersion],
    );
    assert.equal(changedSpace.rows[0].count, 0);

    async function rejected(sql) {
      await client.query('savepoint vector_guard');
      let code;
      try {
        await client.query(sql);
      } catch (error) {
        code = error.code;
        await client.query('rollback to savepoint vector_guard');
      }
      await client.query('release savepoint vector_guard');
      assert.equal(code, '22000', 'Postgres must reject mismatched vector dimensions');
      return code;
    }
    const comparisonDimensionCode = await rejected("select '[1,0]'::vector <=> '[1,0,0]'::vector");
    const storageDimensionCode = await rejected("select '[1,0]'::vector(3)");
    assert.throws(() => validateQuerySpace([1, 0], space));
    assert.throws(() => validateQuerySpace([0, 0, 0], space));
    assert.throws(() => validateQuerySpace([1, Number.NaN, 0], space));
    assert.throws(() => validateQuerySpace([1, 0, 0], { ...space, taskType: 'classification' }));
    await client.query('rollback');
    return {
      ok: true,
      readOnly: true,
      synthetic: true,
      baseline: baseline.rows[0],
      semantic: semantic.rows,
      lexical: lexical.rows,
      guards: { incompatibleSpaceExcluded: true, comparisonDimensionCode, storageDimensionCode },
      limitations:
        'SQL plumbing only; no embedding provider, real corpus, Arabic recall, or scholarly assessment.',
    };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let client;
  try {
    const raw = process.env.RAG_DATABASE_URL_UNPOOLED;
    assert(raw, 'RAG_DATABASE_URL_UNPOOLED is required');
    const url = new URL(raw);
    assert(!url.hostname.includes('-pooler'), 'Use a direct connection');
    url.searchParams.delete('sslmode');
    url.searchParams.delete('channel_binding');
    client = new pg.Client({
      connectionString: url.toString(),
      ssl: { rejectUnauthorized: true },
      connectionTimeoutMillis: 15000,
      application_name: 'basirah-readonly-vector-smoke',
    });
    await client.connect();
    console.log(JSON.stringify(await verifyVectorRetrieval(client), null, 2));
  } catch (error) {
    // Do not echo a driver error, URI, environment variable, or credential.
    console.error(JSON.stringify({ ok: false, code: error.code ?? 'vector_smoke_failed' }));
    process.exitCode = 1;
  } finally {
    await client?.end();
  }
}
