import { describe, it, expect } from "vitest";
import { findSentences } from "../highlight";

describe("sentence detection — punctuation + decimal guard", () => {
  it("does not split on the '.' in 'Theorem 1.2' (short decimal)", () => {
    const s = findSentences("By Theorem 1.2 we conclude X.");
    expect(s).toHaveLength(1);
    expect(s[0]!.text).toBe("By Theorem 1.2 we conclude X.");
  });

  it("splits on '.' in 'arXiv:2401.01234.' (long digit run = ID, not decimal)", () => {
    const s = findSentences(
      "We present arXiv:2401.01234. By Theorem 1.2 we show convergence."
    );
    expect(s).toHaveLength(2);
    expect(s[0]!.text).toBe("We present arXiv:2401.01234.");
    expect(s[1]!.text).toBe(" By Theorem 1.2 we show convergence.");
  });

  it("does not split on e.g. 3.14 (decimal)", () => {
    const s = findSentences("We use e.g. 3.14 for π. It works.");
    expect(s).toHaveLength(2);
    expect(s[0]!.text).toBe("We use e.g. 3.14 for π.");
    expect(s[1]!.text).toBe(" It works.");
  });

  it("splits between two regular sentences", () => {
    const s = findSentences("First sentence. Second sentence.");
    expect(s).toHaveLength(2);
    expect(s[0]!.text).toBe("First sentence.");
    expect(s[1]!.text).toBe(" Second sentence.");
  });

  it("treats '!' and '?' as boundaries", () => {
    const s = findSentences("Wow! Is this real? Yes.");
    expect(s).toHaveLength(3);
    expect(s[0]!.text).toBe("Wow!");
    expect(s[1]!.text).toBe(" Is this real?");
    expect(s[2]!.text).toBe(" Yes.");
  });

  it("realistic arxiv abstract: 3 sentences with mid-decimal and IDs", () => {
    const text =
      "We present a method for arXiv:2401.01234. By Theorem 1.2 we show convergence in O(n log n). Our approach achieves state-of-the-art results on MNIST and CIFAR-10.";
    const s = findSentences(text);
    expect(s).toHaveLength(3);
    expect(s[0]!.text).toBe("We present a method for arXiv:2401.01234.");
    expect(s[1]!.text).toBe(" By Theorem 1.2 we show convergence in O(n log n).");
    expect(s[2]!.text).toBe(" Our approach achieves state-of-the-art results on MNIST and CIFAR-10.");
  });

  it("version number '1.2.3.4' stays as one segment (chained decimals)", () => {
    const s = findSentences("We use version 1.2.3.4 in production.");
    // Each '.' between short digit runs is decimal-context, so none of
    // them are boundaries. The trailing '.' is end-of-sentence. Result:
    // one sentence.
    expect(s).toHaveLength(1);
    expect(s[0]!.text).toBe("We use version 1.2.3.4 in production.");
  });
});
