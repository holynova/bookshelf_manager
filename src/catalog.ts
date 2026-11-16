export interface Candidate {
  title: string;
  author: string;
  description: string;
  coverColor: string;
  row: number;
  position: number;
  confidence: "high" | "medium" | "low";
  bbox?: [number, number, number, number];
}
const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
export function validateCandidates(value: unknown): Candidate[] {
  if (
    !isRecord(value) ||
    !Array.isArray(value.books) ||
    !value.books.length ||
    value.books.length > 300
  )
    throw new Error(
      "模型应返回 1–300 本书的 books 数组，请换一张更清晰的照片。",
    );
  return value.books.map((item: unknown, i: number) => {
    if (!isRecord(item)) throw new Error(`第 ${i + 1} 本书格式无效。`);
    const text = (key: string, max: number) =>
      typeof item[key] === "string"
        ? (item[key] as string).trim().slice(0, max)
        : "";
    const coordinate = (key: string) => {
      const v = Number(item[key]);
      return Number.isInteger(v) && v >= 1 && v <= 100 ? v : 1;
    };
    let bbox: Candidate["bbox"];
    if (
      Array.isArray(item.bbox) &&
      item.bbox.length === 4 &&
      item.bbox.every(
        (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1,
      )
    ) {
      const [x, y, w, h] = item.bbox as number[];
      if (w > 0 && h > 0 && x + w <= 1.01 && y + h <= 1.01) bbox = [x, y, w, h];
    }
    return {
      title: text("title", 200) || "待确认书名",
      author: text("author", 200),
      description: text("description", 2000),
      coverColor: /^#[0-9a-f]{6}$/i.test(String(item.coverColor))
        ? String(item.coverColor)
        : "#64745a",
      row: coordinate("row"),
      position: coordinate("position"),
      confidence:
        item.confidence === "high"
          ? "high"
          : item.confidence === "medium"
            ? "medium"
            : "low",
      bbox,
    };
  });
}
export function identity(title: string, author: string) {
  return `${title
    .normalize("NFKC")
    .toLowerCase()
    .replace(
      /[\s《》·.,，。]/g,
      "",
    )}|${author.normalize("NFKC").toLowerCase().replace(/\s/g, "")}`;
}
export interface BackupShelf {
  id: number;
  name: string;
  description: string;
  createdAt: number;
  photoUrl?: string;
}
export interface BackupBook extends Candidate {
  id?: number;
  shelfId: number;
  createdAt: number;
  isDigitized: boolean;
  notes?: string;
  readingStatus?: string;
}
export function validateBackup(value: unknown): {
  shelves: BackupShelf[];
  books: BackupBook[];
} {
  if (
    !isRecord(value) ||
    value.format !== "bookshelf-studio" ||
    value.version !== 2 ||
    !Array.isArray(value.shelves) ||
    !Array.isArray(value.books) ||
    value.shelves.length > 500 ||
    value.books.length > 10000
  )
    throw new Error("不是有效的书香管家备份（v2）。");
  const ids = new Set<number>();
  const shelves = value.shelves.map((s: unknown) => {
    if (
      !isRecord(s) ||
      !Number.isSafeInteger(s.id) ||
      typeof s.name !== "string" ||
      !s.name.trim() ||
      s.name.length > 200 ||
      typeof s.createdAt !== "number" ||
      !Number.isFinite(s.createdAt) ||
      ids.has(Number(s.id))
    )
      throw new Error("备份中的书架信息无效。");
    ids.add(Number(s.id));
    if (
      s.photoUrl !== undefined &&
      (typeof s.photoUrl !== "string" ||
        s.photoUrl.length > 15_000_000 ||
        !/^data:image\/(jpeg|png|webp);base64,/.test(s.photoUrl))
    )
      throw new Error("备份照片格式无效。");
    return {
      id: Number(s.id),
      name: s.name,
      description:
        typeof s.description === "string" ? s.description.slice(0, 2000) : "",
      createdAt: s.createdAt,
      photoUrl: s.photoUrl as string | undefined,
    };
  });
  const books = value.books.map((b: unknown) => {
    if (
      !isRecord(b) ||
      !ids.has(Number(b.shelfId)) ||
      typeof b.title !== "string" ||
      !b.title.trim() ||
      typeof b.createdAt !== "number" ||
      !Number.isFinite(b.createdAt)
    )
      throw new Error("备份中的书籍或所属书架无效。");
    return {
      ...validateCandidates({ books: [b] })[0],
      shelfId: Number(b.shelfId),
      createdAt: b.createdAt,
      isDigitized: b.isDigitized === true,
      notes: typeof b.notes === "string" ? b.notes.slice(0, 5000) : "",
      readingStatus: ["unread", "reading", "done"].includes(
        String(b.readingStatus),
      )
        ? String(b.readingStatus)
        : "unread",
    };
  });
  return { shelves, books };
}
