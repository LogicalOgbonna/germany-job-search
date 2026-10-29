import test from "node:test";
import assert from "node:assert/strict";
import { measureAnswer } from "../src/lib/interviews/practice";

// measureAnswer is pure.

test("measureAnswer counts words, pace and English filler words", () => {
  const result = measureAnswer(
    "Um, so I basically led the migration. Uh, you know, it was, like, kind of hard. I mean, actually it worked.",
    30,
  );
  assert.equal(result.words, 21);
  assert.equal(result.wordsPerMinute, 42);
  assert.deepEqual(result.fillerWords, {
    um: 1,
    uh: 1,
    so: 1,
    basically: 1,
    "you know": 1,
    like: 1,
    "kind of": 1,
    "i mean": 1,
    actually: 1,
  });
});

test("measureAnswer matches whole words only", () => {
  const result = measureAnswer(
    "Summer umbrella, likely sorted, someone also helped, Erlang error.",
    60,
  );
  // "also" is only a filler in German answers; this one reads as English.
  assert.deepEqual(result.fillerWords, {});
});

test("measureAnswer counts German filler words", () => {
  const result = measureAnswer(
    "Ähm, also ich habe das halt quasi sozusagen allein gebaut, äh, und das war gut.",
    20,
  );
  assert.deepEqual(result.fillerWords, {
    ähm: 1,
    also: 1,
    halt: 1,
    quasi: 1,
    sozusagen: 1,
    äh: 1,
  });
  assert.equal(result.words, 15);
  assert.equal(result.wordsPerMinute, 45);
});

test("measureAnswer counts repeated and elongated fillers", () => {
  const result = measureAnswer("Umm, um, uhh. Like, like, so.", 6);
  assert.equal(result.fillerWords.um, 2);
  assert.equal(result.fillerWords.uh, 1);
  assert.equal(result.fillerWords.like, 2);
  assert.equal(result.fillerWords.so, 1);
});

test("measureAnswer handles an empty transcript and zero seconds", () => {
  assert.deepEqual(measureAnswer("", 30), {
    words: 0,
    wordsPerMinute: 0,
    fillerWords: {},
  });
  assert.deepEqual(measureAnswer("   ", 0), {
    words: 0,
    wordsPerMinute: 0,
    fillerWords: {},
  });
  const typed = measureAnswer("I built the design system.", 0);
  assert.equal(typed.words, 5);
  assert.equal(typed.wordsPerMinute, 0);
  assert.equal(measureAnswer("one two", Number.NaN).wordsPerMinute, 0);
  assert.equal(measureAnswer("one two", -5).wordsPerMinute, 0);
});
