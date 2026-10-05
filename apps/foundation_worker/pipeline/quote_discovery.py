"""Mechanical wrappers and conservative discovery; never quotation fidelity."""
import re
from .evidence import normalize

QUOTES = re.compile(r'﴿([^﴿﴾\n]+)﴾|«([^«»\n]+)»|“([^“”\n]+)”|"([^"\n]+)"|<<([^<>\n]+)>>|<([^<>\n]+)>|\(([^()\n]+)\)|\[([^\[\]\n]+)\]|\{([^{}\n]+)\}|‹([^‹›\n]+)›|(?:<<|[﴿«“(<\[{‹])([^﴿﴾«»“”()<>\[\]{}‹›.!?؟؛\n]+)(?=[﴾»”)>\]}›.!?؟؛\n]|$)')
CONTAINERS = QUOTES.pattern


def ordered_omission(quote, source):
    """One unique two-run alignment, all words preserved, small internal gap.

    Search folding only identifies a candidate original. The caller must still
    compare literal text independently and retain its mismatch.
    """
    q, s = normalize(quote).split(), normalize(source).split()
    if not 5 <= len(q) <= 60:
        return False
    paths = []
    for split in range(2, len(q)-1):
        left, right = q[:split], q[split:]
        for start in range(len(s)-len(left)+1):
            if s[start:start+len(left)] != left:
                continue
            for gap in range(1, 7):
                at = start+len(left)+gap
                if s[at:at+len(right)] == right:
                    paths.append((start, split, gap))
    return len(paths) == 1
