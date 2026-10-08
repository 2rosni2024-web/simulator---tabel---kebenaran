#!/usr/bin/env python3
"""Simulator tabel kebenaran (versi Python).

Pemakaian:
    python tabel_kebenaran.py "(P -> Q) & (Q -> R) -> (P -> R)"
    python tabel_kebenaran.py              # mode interaktif
    python tabel_kebenaran.py "P ^ Q" --biner   # tampilkan 1/0

Operator: & / AND / ∧, | / OR / ∨, ! / ~ / NOT / ¬, ^ / XOR / ⊕,
          -> / → (jika-maka), <-> / ↔ (jika dan hanya jika).
Prioritas: NOT > AND > XOR > OR > -> > <->
Parser ditulis sendiri, tanpa eval(), sehingga aman dipakai.
"""
import re
import sys
from itertools import product

TOKEN_RE = re.compile(
    r"\s*(?:(<->|<=>|↔)|(->|=>|→)|(&&|&|∧)|(\|\||\||∨)|(!|~|¬)|(\^|⊕)|(\()|(\))|([A-Za-z_]\w*))"
)
KINDS = ["IFF", "IMP", "AND", "OR", "NOT", "XOR", "LP", "RP", "VAR"]
SYM = {"AND": "∧", "OR": "∨", "XOR": "⊕", "IMP": "→", "IFF": "↔"}
MAX_VARS = 6


def tokenize(text):
    tokens, pos = [], 0
    while pos < len(text):
        if text[pos:].strip() == "":
            break
        m = TOKEN_RE.match(text, pos)
        if not m:
            bad = text[pos:].lstrip()[0]
            raise ValueError(f"Karakter '{bad}' tidak dikenali.")
        kind = KINDS[m.lastindex - 1]
        value = m.group(m.lastindex)
        if kind == "VAR" and value.upper() in ("AND", "OR", "NOT", "XOR"):
            kind = value.upper()
        tokens.append((kind, value))
        pos = m.end()
    return tokens


class Parser:
    def __init__(self, tokens):
        self.t, self.p = tokens, 0

    def peek(self):
        return self.t[self.p][0] if self.p < len(self.t) else None

    def take(self):
        tok = self.t[self.p]
        self.p += 1
        return tok

    def parse(self):
        if not self.t:
            raise ValueError("Ekspresi masih kosong.")
        node = self.iff()
        if self.p < len(self.t):
            raise ValueError("Ada bagian ekspresi yang tidak terbaca atau kurung berlebih.")
        return node

    def _left(self, nxt, kind):
        node = nxt()
        while self.peek() == kind:
            self.take()
            node = ("bin", kind, node, nxt())
        return node

    def iff(self):
        return self._left(self.imp, "IFF")

    def imp(self):
        left = self.or_()
        if self.peek() == "IMP":
            self.take()
            return ("bin", "IMP", left, self.imp())  # asosiatif kanan
        return left

    def or_(self):
        return self._left(self.xor, "OR")

    def xor(self):
        return self._left(self.and_, "XOR")

    def and_(self):
        return self._left(self.not_, "AND")

    def not_(self):
        if self.peek() == "NOT":
            self.take()
            return ("not", self.not_())
        return self.atom()

    def atom(self):
        kind = self.peek()
        if kind == "VAR":
            return ("var", self.take()[1])
        if kind == "LP":
            self.take()
            node = self.iff()
            if self.peek() != "RP":
                raise ValueError("Tanda kurung buka tidak punya pasangan penutup.")
            self.take()
            return node
        raise ValueError("Ekspresi tidak lengkap atau operator salah tempat.")


def to_str(node, top=False):
    if node[0] == "var":
        return node[1]
    if node[0] == "not":
        return "¬" + to_str(node[1])
    s = f"{to_str(node[2])} {SYM[node[1]]} {to_str(node[3])}"
    return s if top else f"({s})"


def evaluate(node, env):
    if node[0] == "var":
        return env[node[1]]
    if node[0] == "not":
        return not evaluate(node[1], env)
    a, b = evaluate(node[2], env), evaluate(node[3], env)
    return {
        "AND": a and b,
        "OR": a or b,
        "XOR": a != b,
        "IMP": (not a) or b,
        "IFF": a == b,
    }[node[1]]


def collect(node, variables, subs):
    if node[0] == "var":
        if node[1] not in variables:
            variables.append(node[1])
        return
    if node[0] == "not":
        collect(node[1], variables, subs)
    else:
        collect(node[2], variables, subs)
        collect(node[3], variables, subs)
    if all(to_str(s, True) != to_str(node, True) for s in subs):
        subs.append(node)


def truth_table(expr, biner=False, langkah=True):
    tree = Parser(tokenize(expr)).parse()
    variables, subs = [], []
    collect(tree, variables, subs)
    variables.sort()
    if not variables:
        raise ValueError("Tambahkan setidaknya satu variabel.")
    if len(variables) > MAX_VARS:
        raise ValueError(f"Terlalu banyak variabel ({len(variables)}). Batasnya {MAX_VARS}.")

    show = subs if (langkah and len(subs) > 1) else subs[-1:]
    headers = variables + [to_str(s, True) for s in show]
    fmt = (lambda v: "1" if v else "0") if biner else (lambda v: "T" if v else "F")

    rows, hasil = [], []
    for combo in product([True, False], repeat=len(variables)):
        env = dict(zip(variables, combo))
        rows.append([fmt(v) for v in combo] + [fmt(evaluate(s, env)) for s in show])
        hasil.append(evaluate(tree, env))

    widths = [max(len(h), 1) for h in headers]
    line = "+-" + "-+-".join("-" * w for w in widths) + "-+"
    out = [line, "| " + " | ".join(h.center(w) for h, w in zip(headers, widths)) + " |", line]
    out += ["| " + " | ".join(c.center(w) for c, w in zip(r, widths)) + " |" for r in rows]
    out.append(line)

    if all(hasil):
        jenis = "Tautologi (selalu benar)"
    elif not any(hasil):
        jenis = "Kontradiksi (selalu salah)"
    else:
        jenis = "Kontingensi (kadang benar, kadang salah)"
    out.append(f"Kesimpulan: {jenis}. Benar {sum(hasil)} dari {len(hasil)} baris.")
    return "\n".join(out)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    biner = "--biner" in sys.argv
    langkah = "--ringkas" not in sys.argv
    if args:
        try:
            print(truth_table(" ".join(args), biner, langkah))
        except ValueError as e:
            sys.exit(f"Galat: {e}")
        return
    print("Simulator tabel kebenaran. Ketik 'keluar' untuk berhenti.")
    while True:
        try:
            expr = input("\nEkspresi> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if expr.lower() in ("keluar", "exit", "quit"):
            break
        try:
            print(truth_table(expr, biner, langkah))
        except ValueError as e:
            print(f"Galat: {e}")


if __name__ == "__main__":
    main()
