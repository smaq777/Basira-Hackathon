# Architecture decision record

Decisions are dated 30 September 2026. “Selected” denotes a design decision, not a deployed integration.

| ID     | Decision                                                         | Rationale and trade-off                                                                                          | State                                       |
| ------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| ADR-01 | Narrow Arabic short-post editorial review                        | Demonstrable evidence trail is more feasible than universal Islamic Q&A                                          | Selected                                    |
| ADR-02 | Separate quotation fidelity and claim support                    | Accurate quotation does not validate every inference                                                             | Selected                                    |
| ADR-03 | Modular Node/React application                                   | Fits team skills and avoids distributed-service overhead                                                         | Foundation scaffold                         |
| ADR-04 | Neon PostgreSQL with lexical and vector retrieval                | One operational data store; extension and migration verification still required                                  | Planned; credentials blocked                |
| ADR-05 | Bounded approved corpus before broad APIs                        | Licensing, context and scholarly suitability outweigh source count                                               | Selected; corpus pending                    |
| ADR-06 | Guest-first; no mandatory login                                  | Low-friction editor trial; requires rigorous session ownership and expiration                                    | Planned                                     |
| ADR-07 | No unrestricted chat in MVP                                      | Preserve testability and avoid scope drift into personal fatwas                                                  | Selected                                    |
| ADR-08 | No model training from scratch                                   | Use evaluated models and retrieval; optimize only after baseline measurements                                    | Selected                                    |
| ADR-09 | Local licensed snapshots as resilience path                      | Provider redundancy does not imply scholarly interchangeability                                                  | Planned                                     |
| ADR-10 | Private development, public committee handoff                    | Owner preference now; challenge deliverable later                                                                | Private repo created                        |
| ADR-11 | Role-scoped `saleh/`, `ahmed/`, and `codex/` issue branches      | Makes implementation ownership visible while keeping every task linked to an issue                               | Applied to collaboration workflow           |
| ADR-12 | Record the foundation merge while protection remains unavailable | The owner-authorized merge of PR #24 does not make the unavailable protection rule equivalent to enforced review | Foundation merged; protection still blocked |
| ADR-13 | English-first documentation; Arabic domain terms/UI              | Supports developer and committee readability without losing Islamic nuance                                       | Applied documentation standard              |

Revisit a decision through its issue and PR. Record evidence, consequences and a migration plan rather than silently overwriting the rationale.
