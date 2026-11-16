import test from "node:test";
import assert from "node:assert/strict";
import {
  validateCandidates,
  identity,
  validateBackup,
} from "../src/catalog.ts";
test("treats missing or malformed recognition as unverified and sanitizes colors", () => {
  const [b] = validateCandidates({
    books: [
      {
        title: " ",
        coverColor: "url(bad)",
        row: -1,
        position: "n/a",
        rating: 9.9,
      },
    ],
  });
  assert.equal(b.title, "待确认书名");
  assert.equal(b.confidence, "low");
  assert.equal(b.coverColor, "#64745a");
  assert.equal(b.row, 1);
  assert.ok(!("rating" in b));
});
test("accepts normalized location boxes, rejects invalid geometry", () => {
  assert.deepEqual(
    validateCandidates({
      books: [{ title: "书", bbox: [0.1, 0.2, 0.3, 0.4] }],
    })[0].bbox,
    [0.1, 0.2, 0.3, 0.4],
  );
  assert.equal(
    validateCandidates({ books: [{ bbox: [0.9, 0.9, 0.5, 0.5] }] })[0].bbox,
    undefined,
  );
});
test("rejects malformed backup and orphan books before writing", () => {
  const b = {
    format: "bookshelf-studio",
    version: 2,
    shelves: [{ id: 1, name: "书房", createdAt: 1 }],
    books: [{ title: "书", shelfId: 2, createdAt: 1 }],
  };
  assert.throws(() => validateBackup(b));
  assert.throws(() =>
    validateBackup({
      ...b,
      books: [],
      shelves: [
        { id: 1, name: "书房", createdAt: 1, photoUrl: "javascript:evil" },
      ],
    }),
  );
});
test("round trips valid archive and normalizes duplicate identities", () => {
  const b = validateBackup({
    format: "bookshelf-studio",
    version: 2,
    shelves: [{ id: 1, name: "书房", createdAt: 1 }],
    books: [
      {
        title: "三体",
        author: "刘慈欣",
        shelfId: 1,
        createdAt: 2,
        isDigitized: true,
        row: 1,
        position: 2,
      },
    ],
  });
  assert.equal(b.books[0].position, 2);
  assert.equal(identity("《三 体》", "刘 慈欣"), identity("三体", "刘慈欣"));
});
