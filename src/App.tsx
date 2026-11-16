import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  BookOpen,
  Camera,
  Search,
  Settings,
  Plus,
  ArrowUpRight,
  Library,
  Download,
  Upload,
  X,
  Check,
  ChevronRight,
  Trash2,
  Bookmark,
} from "lucide-react";
import { db, seedDemoData, type Book } from "./db";
import { identity, validateBackup, type Candidate } from "./catalog";
import { scanBookshelfPhoto } from "./llm";
import "./App.css";
const statusNames: Record<string, string> = {
  unread: "未读",
  reading: "在读",
  done: "已读",
};
const newCandidate = (): Candidate => ({
  title: "",
  author: "",
  description: "",
  coverColor: "#526b58",
  row: 1,
  position: 1,
  confidence: "low",
});
function bookInk(color: string) {
  const rgb = /^#[0-9a-f]{6}$/i.test(color) ? color.slice(1).match(/../g)!.map(v => parseInt(v, 16)) : [70, 90, 60];
  return rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114 > 165 ? "#2b3b29" : "#fffcef";
}
function download(blob: Blob, name: string) {
  const u = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 10000);
}
async function photoFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/"))
    throw new Error("请选择 JPG、PNG 或 WebP 照片。");
  if (file.size > 25 * 1024 * 1024)
    throw new Error("照片请控制在 25 MB 以内。");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 2000 / Math.max(image.width, image.height));
    const c = document.createElement("canvas");
    c.width = Math.round(image.width * scale);
    c.height = Math.round(image.height * scale);
    c.getContext("2d")!.drawImage(image, 0, 0, c.width, c.height);
    const result = c.toDataURL("image/jpeg", 0.86);
    c.width = c.height = 0;
    return result;
  } finally {
    URL.revokeObjectURL(url);
  }
}
export default function App() {
  const shelves = useLiveQuery(() => db.shelves.toArray()) || [],
    books = useLiveQuery(() => db.books.toArray()) || [];
  const [tab, setTab] = useState<"library" | "scan" | "settings">("library"),
    [shelf, setShelf] = useState("all"),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [view, setView] = useState<"shelf" | "list">("shelf"),
    [selected, setSelected] = useState<number | null>(null),
    [edit, setEdit] = useState<Book | null>(null),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [deleted, setDeleted] = useState<Book | null>(null);
  const [photo, setPhoto] = useState(""),
    [candidates, setCandidates] = useState<Candidate[]>([]),
    [checked, setChecked] = useState<number[]>([]),
    [focused, setFocused] = useState(0),
    [target, setTarget] = useState("new"),
    [shelfName, setShelfName] = useState(""),
    [shelfDesc, setShelfDesc] = useState(""),
    [demo, setDemo] = useState(false);
  const [base, setBase] = useState(
      () => localStorage.getItem("llm_api_base") || "https://api.openai.com/v1",
    ),
    [model, setModel] = useState(() => localStorage.getItem("llm_model") || ""),
    [key, setKey] = useState(
      () =>
        sessionStorage.getItem("bookshelf_key") ||
        localStorage.getItem("llm_api_key") ||
        "",
    );
  const photoInput = useRef<HTMLInputElement>(null),
    backupInput = useRef<HTMLInputElement>(null),
    abort = useRef<AbortController | null>(null),
    dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (edit) dialog.current?.showModal();
    else dialog.current?.close();
  }, [edit?.id, !!edit]);
  const keys = books.reduce((m, b) => {
    const k = identity(b.title, b.author);
    m.set(k, (m.get(k) || 0) + 1);
    return m;
  }, new Map<string, number>());
  const visible = books
    .filter(
      (b) =>
        (shelf === "all" || b.shelfId === +shelf) &&
        `${b.title} ${b.author} ${b.notes || ""}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (filter === "all" ||
          (filter === "duplicate" &&
            (keys.get(identity(b.title, b.author)) || 0) > 1) ||
          (filter === "unconfirmed" && !b.isDigitized) ||
          (b.readingStatus || "unread") === filter),
    )
    .sort(
      (a, b) =>
        a.shelfId - b.shelfId || a.row - b.row || a.position - b.position,
    );
  const book = books.find((b) => b.id === selected),
    bookShelf = shelves.find((s) => s.id === book?.shelfId);
  const guard = async (fn: () => Promise<void>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败，请重试。");
    }
  };
  function startScan() {
    setTab("scan");
    setSelected(null);
  }
  async function image(file?: File) {
    if (!file || busy) return;
    await guard(async () => {
      setBusy("正在准备照片");
      try {
        setPhoto(await photoFile(file));
        setCandidates([]);
        setChecked([]);
        setDemo(false);
      } finally {
        setBusy("");
      }
    });
    if (photoInput.current) photoInput.current.value = "";
  }
  async function scan() {
    await guard(async () => {
      if (!photo) throw new Error("请先上传书架照片。");
      if (!key || !model)
        throw new Error(
          "请先在模型设置中填写接口、模型和 API Key，或使用演示校对。",
        );
      const c = new AbortController();
      abort.current = c;
      const timeout = setTimeout(() => c.abort(), 90000);
      setBusy("正在识别照片，请稍候");
      setDemo(false);
      try {
        const result = await scanBookshelfPhoto(
          photo,
          base,
          key,
          model,
          c.signal,
        );
        setCandidates(result.books);
        setChecked([]);
        setFocused(0);
      } catch (e) {
        if (c.signal.aborted) throw new Error("识别已取消或超时，请重试。");
        throw e;
      } finally {
        clearTimeout(timeout);
        setBusy("");
        abort.current = null;
      }
    });
  }
  async function demoReview() {
    await guard(async () => {
      const response = await fetch(
        import.meta.env.BASE_URL + "demo_bookshelf.jpg",
      );
      if (!response.ok) throw new Error("演示照片加载失败。");
      const f = new File([await response.blob()], "demo.jpg", {
        type: "image/jpeg",
      });
      setPhoto(await photoFile(f));
      setDemo(true);
      setCandidates([
        {
          ...newCandidate(),
          title: "三体",
          author: "刘慈欣",
          coverColor: "#334a52",
          confidence: "high",
        },
        {
          ...newCandidate(),
          title: "人类简史",
          author: "尤瓦尔·赫拉利",
          position: 2,
          coverColor: "#b99e71",
          confidence: "medium",
        },
        {
          ...newCandidate(),
          title: "待确认书名",
          position: 3,
          confidence: "low",
        },
      ]);
      setChecked([]);
      setFocused(0);
      setShelfName("演示书架");
      setNotice("这是预置校对示例，未经模型识别；书名和位置不保证与照片对应。");
    });
  }
  function patch(i: number, p: Partial<Candidate>) {
    setCandidates((c) => c.map((b, j) => (j === i ? { ...b, ...p } : b)));
  }
  async function saveCandidates() {
    if (busy) return;
    await guard(async () => {
      if (!checked.length) throw new Error("请勾选已核对的书籍。");
      if (target === "new" && !shelfName.trim())
        throw new Error("给新书架起个名字。");
      const chosen = candidates.filter((_, i) => checked.includes(i));
      if (
        chosen.some(
          (b) =>
            !b.title.trim() ||
            b.title === "待确认书名" ||
            !Number.isInteger(b.row) ||
            b.row < 1 ||
            b.row > 100 ||
            !Number.isInteger(b.position) ||
            b.position < 1 ||
            b.position > 100,
        )
      )
        throw new Error("请补全书名，层数与位置需为 1–100 的整数。");
      setBusy("正在保存");
      try {
        let sid = 0;
        await db.transaction("rw", db.shelves, db.books, async () => {
          sid =
            target === "new"
              ? Number(
                  await db.shelves.add({
                    name: shelfName.trim(),
                    description: shelfDesc.trim(),
                    photoUrl: photo || undefined,
                    createdAt: Date.now(),
                  }),
                )
              : +target;
          if (!(await db.shelves.get(sid)))
            throw new Error("目标书架已不存在。");
          for (const b of chosen) {
            await db.books.add({
              ...b,
              bbox: target === "new" ? b.bbox : undefined,
              title: b.title.trim(),
              shelfId: sid,
              rating: 0,
              doubanLink: "",
              wereadLink: "",
              taobaoLink: "",
              isDigitized: true,
              readingStatus: "unread",
              createdAt: Date.now(),
            });
          }
        });
        setNotice(`已添加 ${chosen.length} 本书，原有藏书全部保留。`);
        setCandidates([]);
        setChecked([]);
        setPhoto("");
        setShelf(String(sid));
        setTab("library");
      } finally {
        setBusy("");
      }
    });
  }
  async function backup() {
    await guard(async () => {
      const ss = await db.shelves.toArray(),
        bb = await db.books.toArray();
      const safe = ss.map((s) => ({
        ...s,
        photoUrl: s.photoUrl?.startsWith("data:image/")
          ? s.photoUrl
          : undefined,
      }));
      download(
        new Blob(
          [
            JSON.stringify(
              {
                format: "bookshelf-studio",
                version: 2,
                exportedAt: new Date().toISOString(),
                shelves: safe,
                books: bb,
              },
              null,
              2,
            ),
          ],
          { type: "application/json" },
        ),
        `bookshelf-${new Date().toISOString().slice(0, 10)}.json`,
      );
      setNotice("备份已导出，不包含 API Key。");
    });
  }
  async function restore(file?: File) {
    if (!file || busy) return;
    await guard(async () => {
      if (file.size > 100 * 1024 * 1024)
        throw new Error("备份文件请控制在 100 MB 以内。");
      const data = validateBackup(JSON.parse(await file.text()));
      setBusy("正在合并备份");
      let added = 0;
      try {
        await db.transaction("rw", db.shelves, db.books, async () => {
          const mapping = new Map<number, number>();
          for (const s of data.shelves) {
            const existing = (await db.shelves.toArray()).find(
              (x) => x.name === s.name && x.createdAt === s.createdAt,
            );
            const { id, ...rest } = s;
            mapping.set(id, existing?.id || Number(await db.shelves.add(rest)));
          }
          for (const b of data.books) {
            const shelfId = mapping.get(b.shelfId)!;
            const matches = await db.books
              .where("shelfId")
              .equals(shelfId)
              .toArray();
            if (
              matches.some(
                (x) =>
                  x.createdAt === b.createdAt &&
                  identity(x.title, x.author) === identity(b.title, b.author),
              )
            )
              continue;
            await db.books.add({
              ...b,
              shelfId,
              rating: 0,
              doubanLink: "",
              wereadLink: "",
              taobaoLink: "",
            });
            added++;
          }
        });
        setNotice(`备份已合并，新增 ${added} 本；重复导入不会覆盖已有数据。`);
      } finally {
        setBusy("");
      }
    });
    if (backupInput.current) backupInput.current.value = "";
  }
  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    await guard(async () => {
      if (
        !edit.title.trim() ||
        edit.row < 1 ||
        edit.position < 1 ||
        !Number.isInteger(edit.row) ||
        !Number.isInteger(edit.position)
      )
        throw new Error("请填写书名和有效位置。");
      const payload = { ...edit, title: edit.title.trim() };
      if (edit.id) await db.books.put(payload);
      else {
        if (!(await db.shelves.get(edit.shelfId)))
          throw new Error("请先创建一个书架。");
        await db.books.add(payload);
      }
      setEdit(null);
      setNotice("书籍已保存。");
    });
  }
  function manual() {
    setDemo(false);
    setCandidates([newCandidate()]);
    setChecked([]);
    setPhoto("");
    setTab("scan");
    setFocused(0);
  }
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="./">
          <BookOpen size={26} />
          <span>
            书香管家<small>A HOME FOR EVERY BOOK</small>
          </span>
        </a>
        <div className="nav-heading">我的书房</div>
        <nav>
          <button
            className={tab === "library" ? "active" : ""}
            onClick={() => setTab("library")}
          >
            <Library size={18} />
            藏书与书架<span>{books.length}</span>
          </button>
          <button
            className={tab === "scan" ? "active" : ""}
            onClick={startScan}
          >
            <Camera size={18} />
            拍照整理
          </button>
        </nav>
        <div className="shelf-nav">
          <div className="nav-heading">书架位置</div>
          <button
            className={shelf === "all" ? "chosen" : ""}
            onClick={() => {
              setShelf("all");
              setTab("library");
            }}
          >
            所有书架 <span>{shelves.length}</span>
          </button>
          {shelves.map((s) => (
            <button
              key={s.id}
              className={shelf === String(s.id) ? "chosen" : ""}
              onClick={() => {
                setShelf(String(s.id));
                setTab("library");
              }}
            >
              <span className="shelf-dot" />
              {s.name}
              <small>{books.filter((b) => b.shelfId === s.id).length}</small>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="small-quote">
            书有归处，
            <br />
            心有余闲。
          </div>
          <button
            className={tab === "settings" ? "active" : ""}
            onClick={() => setTab("settings")}
          >
            <Settings size={16} />
            模型与备份
          </button>
          <a
            href="https://github.com/holynova/bookshelf_manager"
            target="_blank"
            rel="noreferrer"
          >
            项目源码 <ArrowUpRight size={13} />
          </a>
          <span className="local">● 藏书保存在当前浏览器</span>
        </div>
      </aside>
      <main>
        <header className="header">
          <div className="breadcrumb">
            我的书房 <ChevronRight size={13} />
            {tab === "library"
              ? "藏书与书架"
              : tab === "scan"
                ? "拍照整理"
                : "模型与备份"}
          </div>
          <span className="header-date">BOOKSHELF / VOL. 02</span>
        </header>
        {(notice || error) && (
          <div
            className={`notice ${error ? "error" : ""}`}
            role={error ? "alert" : "status"}
          >
            {error || notice}
            <button
              onClick={() => {
                setError("");
                setNotice("");
              }}
              aria-label="关闭消息"
            >
              <X size={15} />
            </button>
            {deleted && (
              <button
                onClick={() =>
                  guard(async () => {
                    await db.books.put(deleted);
                    setDeleted(null);
                    setNotice("已恢复书籍。");
                  })
                }
              >
                撤销删除
              </button>
            )}
          </div>
        )}
        {tab === "library" ? (
          <>
            <section className="page-title">
              <div>
                <div className="eyebrow">YOUR PERSONAL LIBRARY</div>
                <h1>每一本书，都找得到。</h1>
                <p>记住你读过的世界，也记住它们在书架上的位置。</p>
              </div>
              <button className="primary" onClick={startScan}>
                <Camera size={16} />
                拍照添加
              </button>
            </section>
            <div className="stats">
              <div>
                <strong>{books.length.toString().padStart(2, "0")}</strong>
                <span>本藏书</span>
              </div>
              <div>
                <strong>{shelves.length.toString().padStart(2, "0")}</strong>
                <span>个书架</span>
              </div>
              <div>
                <strong>
                  {books
                    .filter((b) => b.readingStatus === "reading")
                    .length.toString()
                    .padStart(2, "0")}
                </strong>
                <span>本正在读</span>
              </div>
              <button
                onClick={() =>
                  setFilter(filter === "duplicate" ? "all" : "duplicate")
                }
              >
                <strong>
                  {books
                    .filter(
                      (b) => (keys.get(identity(b.title, b.author)) || 0) > 1,
                    )
                    .length.toString()
                    .padStart(2, "0")}
                </strong>
                <span>本可能重复 ↗</span>
              </button>
            </div>
            <div className="library-tools">
              <label className="search">
                <Search size={16} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="找一本书、一位作者…"
                  aria-label="搜索藏书"
                />
              </label>
              <select aria-label="选择书架" value={shelf} onChange={e => setShelf(e.target.value)}>
                <option value="all">所有书架</option>
                {shelves.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select
                aria-label="筛选藏书"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">全部藏书</option>
                <option value="unread">未读</option>
                <option value="reading">在读</option>
                <option value="done">已读</option>
                <option value="unconfirmed">待确认</option>
                <option value="duplicate">可能重复</option>
              </select>
              <div className="view-toggle">
                <button
                  className={view === "shelf" ? "active" : ""}
                  onClick={() => setView("shelf")}
                >
                  书架
                </button>
                <button
                  className={view === "list" ? "active" : ""}
                  onClick={() => setView("list")}
                >
                  列表
                </button>
              </div>
              <button
                className="icon-button"
                aria-label="手动添加书籍"
                onClick={manual}
              >
                <Plus size={18} />
              </button>
            </div>
            {!books.length ? (
              <div className="onboarding">
                <div className="book-illustration">
                  {["#b99b71", "#6c7b64", "#b15b45", "#d5c8ac", "#4e6261"].map(
                    (c, i) => (
                      <span
                        key={c}
                        style={{
                          background: c,
                          height: 130 + (i % 3) * 18,
                          transform: `rotate(${i === 0 ? -8 : 0}deg)`,
                        }}
                      >
                        书
                      </span>
                    ),
                  )}
                </div>
                <h2>把你的书架，搬进这里。</h2>
                <p>
                  拍一张照片，逐本确认后建立藏书索引。
                  <br />
                  也可以手动录入，不需要连接模型。
                </p>
                <div>
                  <button className="primary" onClick={startScan}>
                    添加第一座书架 →
                  </button>
                  <button
                    className="text-button"
                    onClick={() =>
                      guard(async () => {
                        await seedDemoData();
                        setNotice("已载入 6 本演示藏书。");
                      })
                    }
                  >
                    先逛逛演示书房
                  </button>
                </div>
              </div>
            ) : !visible.length ? (
              <div className="no-results">
                <h2>没有找到这本书</h2>
                <p>试试其他关键词，或清除筛选。</p>
                <button
                  className="text-button"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                    setShelf("all");
                  }}
                >
                  查看全部藏书 →
                </button>
              </div>
            ) : (
              <div className={`library-content ${book ? "with-details" : ""}`}>
                <section>
                  {view === "shelf" ? (
                    shelves
                      .filter((s) => visible.some((b) => b.shelfId === s.id))
                      .map((s) => (
                        <div className="shelf-section" key={s.id}>
                          <div className="shelf-title">
                            <h2>{s.name}</h2>
                            <span>
                              {visible.filter((b) => b.shelfId === s.id).length}{" "}
                              本 · {s.description || "我的私人藏书"}
                            </span>
                          </div>
                          {[
                            ...new Set(
                              visible
                                .filter((b) => b.shelfId === s.id)
                                .map((b) => b.row),
                            ),
                          ]
                            .sort((a, b) => a - b)
                            .map((row) => (
                              <div className="shelf-row" key={row}>
                                <span className="row-label">
                                  {String(row).padStart(2, "0")} 层
                                </span>
                                <div className="spines">
                                  {visible
                                    .filter(
                                      (b) =>
                                        b.shelfId === s.id && b.row === row,
                                    )
                                    .map((b, i) => (
                                      <button
                                        key={b.id}
                                        className={`spine ${b.id === selected ? "selected" : ""}`}
                                        onClick={() => setSelected(b.id!)}
                                        aria-label={`${b.title}，第 ${b.row} 层第 ${b.position} 本`}
                                        style={{
                                          backgroundColor: b.coverColor,
                                color: bookInk(b.coverColor),
                                          height: 155 + ((i * 17) % 35),
                                        }}
                                      >
                                        <span>{b.title}</span>
                                        <small>
                                          {b.author || "作者待补充"}
                                        </small>
                                        <i>
                                          {String(b.position).padStart(2, "0")}
                                        </i>
                                      </button>
                                    ))}
                                </div>
                                <div className="wood-edge" />
                              </div>
                            ))}
                        </div>
                      ))
                  ) : (
                    <div className="book-list">
                      {visible.map((b) => (
                        <button
                          className="list-book"
                          key={b.id}
                          onClick={() => setSelected(b.id!)}
                        >
                          <span
                            className="mini-cover"
                            style={{ background: b.coverColor }}
                          >
                            <BookOpen size={20} />
                          </span>
                          <span>
                            <strong>{b.title}</strong>
                            <small>{b.author || "作者待补充"}</small>
                          </span>
                          <span className="list-location">
                            {shelves.find((s) => s.id === b.shelfId)?.name}
                            <small>
                              第 {b.row} 层 · 第 {b.position} 本
                            </small>
                          </span>
                          <span className="status-tag">
                            {statusNames[b.readingStatus || "unread"]}
                          </span>
                          <ChevronRight size={15} />
                        </button>
                      ))}
                    </div>
                  )}
                </section>
                {book && (
                  <aside className="book-detail">
                    <button
                      className="close-detail"
                      onClick={() => setSelected(null)}
                      aria-label="关闭书籍详情"
                    >
                      <X size={17} />
                    </button>
                    <div
                      className="detail-cover"
                      style={{ background: book.coverColor, color: bookInk(book.coverColor) }}
                    >
                      <span>藏书档案 / {String(book.id).padStart(3, "0")}</span>
                      <h2>{book.title}</h2>
                      <p>{book.author || "作者待补充"}</p>
                      <BookOpen size={26} />
                    </div>
                    <div className="location">
                      <Bookmark size={15} />
                      <div>
                        {bookShelf?.name}
                        <strong>
                          第 {book.row} 层 · 从左数第 {book.position} 本
                        </strong>
                      </div>
                    </div>
                    {bookShelf?.photoUrl && (
                      <div className="photo-locator">
                        <img
                          src={
                            bookShelf.photoUrl.startsWith("/demo_")
                              ? import.meta.env.BASE_URL + "demo_bookshelf.jpg"
                              : bookShelf.photoUrl
                          }
                          alt="这本书所在书架的原始照片"
                        />
                        {book.bbox && (
                          <span
                            className="bbox"
                            style={{
                              left: book.bbox[0] * 100 + "%",
                              top: book.bbox[1] * 100 + "%",
                              width: book.bbox[2] * 100 + "%",
                              height: book.bbox[3] * 100 + "%",
                            }}
                          />
                        )}
                      </div>
                    )}
                    <label>
                      阅读状态
                      <select
                        value={book.readingStatus || "unread"}
                        onChange={(e) =>
                          guard(async () => {
                            await db.books.update(book.id!, {
                              readingStatus: e.target.value,
                            });
                          })
                        }
                      >
                        {Object.entries(statusNames).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="description">
                      {book.notes ||
                        book.description ||
                        "还没有笔记，为这本书留下一点印象吧。"}
                    </p>
                    {(keys.get(identity(book.title, book.author)) || 0) > 1 && (
                      <p className="duplicate">
                        书房里还有同名同作者的书，请核对是否为不同版本。
                      </p>
                    )}
                    <div className="detail-actions">
                      <button
                        className="primary"
                        onClick={() => setEdit({ ...book })}
                      >
                        编辑档案
                      </button>
                      <button
                        className="icon-button"
                        aria-label="删除此书"
                        onClick={() =>
                          guard(async () => {
                            await db.books.delete(book.id!);
                            setDeleted(book);
                            setSelected(null);
                            setNotice("书籍已删除，可以撤销。");
                          })
                        }
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                    <a
                      className="external"
                      href={`https://search.douban.com/book/subject_search?search_text=${encodeURIComponent(book.title)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      去豆瓣查阅资料 <ArrowUpRight size={12} />
                    </a>
                  </aside>
                )}
              </div>
            )}
          </>
        ) : tab === "scan" ? (
          <>
            <section className="page-title">
              <div>
                <div className="eyebrow">A PLACE FOR EVERY STORY</div>
                <h1>拍下来，再慢慢整理。</h1>
                <p>正面拍摄书脊，光线均匀。识别结果经你核对后才会入库。</p>
              </div>
              <button className="text-button" onClick={manual}>
                <Plus size={15} />
                手动录入
              </button>
            </section>
            <div className="scan-layout">
              <section className="photo-panel">
                <div className="panel-label">
                  01 / 书架照片{demo && <span>预置演示</span>}
                </div>
                <input
                  ref={photoInput}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => image(e.target.files?.[0])}
                />
                {photo ? (
                  <div className="photo-locator scan-photo">
                    <img src={photo} alt="待整理书架照片" />
                    {candidates[focused]?.bbox && (
                      <span
                        className="bbox"
                        style={{
                          left: candidates[focused].bbox![0] * 100 + "%",
                          top: candidates[focused].bbox![1] * 100 + "%",
                          width: candidates[focused].bbox![2] * 100 + "%",
                          height: candidates[focused].bbox![3] * 100 + "%",
                        }}
                      />
                    )}
                  </div>
                ) : (
                  <button
                    className="photo-drop"
                    disabled={!!busy}
                    onClick={() => photoInput.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      image(e.dataTransfer.files[0]);
                    }}
                  >
                    <Camera size={35} />
                    <strong>选择一张书架照片</strong>
                    <span>点击上传，或拖放到这里</span>
                  </button>
                )}
                <div className="photo-actions">
                  <button
                    className="text-button"
                    disabled={!!busy}
                    onClick={() => photoInput.current?.click()}
                  >
                    {photo ? "更换照片" : "上传照片"}
                  </button>
                  <button
                    className="text-button"
                    disabled={!!busy}
                    onClick={demoReview}
                  >
                    演示校对 ↗
                  </button>
                </div>
                <button
                  className="primary"
                  disabled={!photo || !!busy}
                  onClick={scan}
                >
                  {busy || "识别照片中的书籍"} <span>→</span>
                </button>
                {abort.current && (
                  <button
                    className="text-button"
                    onClick={() => abort.current?.abort()}
                  >
                    取消识别
                  </button>
                )}
                <p className="subnote">
                  点击识别会将照片发送到你配置的模型服务。
                  <br />
                  藏书档案保存在本机，API Key 不进入备份。
                </p>
                <div className="panel-label destination">存放到哪里</div>
                <label>
                  目标书架
                  <select
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    disabled={!!busy}
                  >
                    <option value="new">＋ 新建书架</option>
                    {shelves.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                {target === "new" && (
                  <>
                    <label>
                      书架名称
                      <input
                        value={shelfName}
                        onChange={(e) => setShelfName(e.target.value)}
                        maxLength={100}
                        placeholder="例如：书房靠窗的书架"
                      />
                    </label>
                    <label>
                      位置备注
                      <input
                        value={shelfDesc}
                        onChange={(e) => setShelfDesc(e.target.value)}
                        maxLength={200}
                        placeholder="例如：书桌右侧，常用书"
                      />
                    </label>
                  </>
                )}
                <p className="subnote">
                  添加到已有书架时，仅追加记录，不覆盖原有藏书与照片。
                </p>
              </section>
              <section className="review-panel">
                <div className="review-heading">
                  <div className="panel-label">
                    02 / 逐本校对 <span>{candidates.length} 本</span>
                  </div>
                  <button
                    className="text-button"
                    disabled={!candidates.length || !!busy}
                    onClick={() => setChecked(candidates.map((_, i) => i))}
                  >
                    全部已核对
                  </button>
                </div>
                {!candidates.length ? (
                  <div className="review-empty">
                    <BookOpen size={34} />
                    <h2>好记性，从一次确认开始。</h2>
                    <p>
                      识别到的书会出现在这里。
                      <br />
                      核对书名、作者和位置，再收进书房。
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="review-list">
                      {candidates.map((b, i) => (
                        <article
                          key={i}
                          className={`candidate ${focused === i ? "focused" : ""}`}
                          onFocus={() => setFocused(i)}
                        >
                          <div className="candidate-top">
                            <label>
                              <input
                                type="checkbox"
                                checked={checked.includes(i)}
                                onChange={(e) =>
                                  setChecked((c) =>
                                    e.target.checked
                                      ? [...c, i]
                                      : c.filter((x) => x !== i),
                                  )
                                }
                              />
                              已核对
                            </label>
                            <span className={`confidence ${b.confidence}`}>
                              {b.confidence === "high"
                                ? "较清晰"
                                : b.confidence === "medium"
                                  ? "需核对"
                                  : "需补充"}
                            </span>
                            <button
                              aria-label={`移除第 ${i + 1} 条识别`}
                              onClick={() => {
                                setCandidates((c) =>
                                  c.filter((_, j) => j !== i),
                                );
                                setChecked((c) =>
                                  c
                                    .filter((x) => x !== i)
                                    .map((x) => (x > i ? x - 1 : x)),
                                );
                                setFocused(0);
                              }}
                            >
                              <X size={14} />
                            </button>
                          </div>
                          <div className="candidate-fields">
                            <label>
                              书名
                              <input
                                value={b.title}
                                onChange={(e) =>
                                  patch(i, { title: e.target.value })
                                }
                              />
                            </label>
                            <label>
                              作者
                              <input
                                value={b.author}
                                onChange={(e) =>
                                  patch(i, { author: e.target.value })
                                }
                                placeholder="看不清可以留空"
                              />
                            </label>
                            <label>
                              第几层
                              <input
                                type="number"
                                min={1}
                                max={100}
                                value={b.row}
                                onChange={(e) =>
                                  patch(i, { row: +e.target.value })
                                }
                              />
                            </label>
                            <label>
                              从左数第几本
                              <input
                                type="number"
                                min={1}
                                max={100}
                                value={b.position}
                                onChange={(e) =>
                                  patch(i, { position: +e.target.value })
                                }
                              />
                            </label>
                          </div>
                          {books.some(
                            (x) =>
                              identity(x.title, x.author) ===
                              identity(b.title, b.author),
                          ) && (
                            <p className="duplicate">
                              已藏有同名同作者的书，仍可作为另一册添加。
                            </p>
                          )}
                          {target !== "new" &&
                            books.some(
                              (x) =>
                                x.shelfId === +target &&
                                x.row === b.row &&
                                x.position === b.position,
                            ) && (
                              <p className="duplicate">
                                该位置已有藏书，请核对位置后再保存。
                              </p>
                            )}
                        </article>
                      ))}
                    </div>
                    <div className="save-bar">
                      <span>
                        {checked.length} / {candidates.length} 本已核对
                      </span>
                      <button
                        className="primary"
                        disabled={!checked.length || !!busy}
                        onClick={saveCandidates}
                      >
                        <Check size={16} />
                        收进书房
                      </button>
                    </div>
                  </>
                )}
              </section>
            </div>
          </>
        ) : (
          <>
            <section className="page-title">
              <div>
                <div className="eyebrow">MAKE YOURSELF AT HOME</div>
                <h1>让书房，按你的方式运转。</h1>
                <p>连接你信任的模型，定期备份你的藏书。</p>
              </div>
            </section>
            <div className="settings-grid">
              <form
                className="settings-card"
                onSubmit={(e) => {
                  e.preventDefault();
                  guard(async () => {
                    const u = new URL(base);
                    if (!["http:", "https:"].includes(u.protocol))
                      throw new Error("请输入 http(s) 接口地址");
                    localStorage.setItem("llm_api_base", base);
                    localStorage.setItem("llm_model", model);
                    sessionStorage.setItem("bookshelf_key", key);
                    setNotice(
                      "设置已保存。新填写的 Key 仅保存在当前标签页会话。",
                    );
                  });
                }}
              >
                <div className="panel-label">视觉识别模型</div>
                <h2>给书房一双眼睛</h2>
                <p>支持提供 Chat Completions 图片输入的兼容接口。</p>
                <label>
                  接口地址
                  <input
                    type="url"
                    required
                    value={base}
                    onChange={(e) => setBase(e.target.value)}
                    placeholder="https://…/v1"
                  />
                </label>
                <label>
                  模型名称
                  <input
                    required
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="填写服务商支持的视觉模型名称"
                  />
                </label>
                <label>
                  API Key
                  <input
                    type="password"
                    autoComplete="off"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder="仅用于你发起的识别"
                  />
                </label>
                <button className="primary">保存模型设置</button>
                <p className="subnote">
                  模型需要允许浏览器跨域调用。没有接口时，也能使用手动录入和演示。
                </p>
              </form>
              <div className="settings-card">
                <div className="panel-label">数据与备份</div>
                <h2>你的藏书，由你保管。</h2>
                <p>
                  本机共有 {shelves.length} 座书架、{books.length}{" "}
                  本书。换设备前，记得导出一份备份。
                </p>
                <div className="backup-box">
                  <BookOpen size={32} />
                  <strong>书房档案 · JSON</strong>
                  <span>书籍、位置、笔记和已保存的照片</span>
                </div>
                <button className="primary" onClick={backup}>
                  <Download size={16} />
                  导出完整备份
                </button>
                <input
                  ref={backupInput}
                  type="file"
                  accept=".json,application/json"
                  hidden
                  onChange={(e) => restore(e.target.files?.[0])}
                />
                <button
                  className="secondary"
                  disabled={!!busy}
                  onClick={() => backupInput.current?.click()}
                >
                  <Upload size={16} />
                  {busy || "导入备份并合并"}
                </button>
                <p className="subnote">
                  导入不会清空书房；同一份备份可重复导入。
                  <br />
                  浏览器清理站点数据会删除本地藏书，请定期备份。
                </p>
              </div>
            </div>
          </>
        )}
        <footer>
          <span>书香管家 · 为每一本书，留一个位置。</span>
          <span>LOCAL FIRST, ALWAYS.</span>
        </footer>
      </main>
      <dialog
        ref={dialog}
        onCancel={() => setEdit(null)}
        className="edit-dialog"
      >
        {edit && (
          <form onSubmit={saveEdit}>
            <div className="dialog-heading">
              <h2>编辑藏书档案</h2>
              <button
                type="button"
                onClick={() => setEdit(null)}
                aria-label="关闭编辑"
              >
                <X size={18} />
              </button>
            </div>
            <label>
              书名
              <input
                autoFocus
                required
                maxLength={200}
                value={edit.title}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              />
            </label>
            <label>
              作者
              <input
                maxLength={200}
                value={edit.author}
                onChange={(e) => setEdit({ ...edit, author: e.target.value })}
              />
            </label>
            <div className="two-cols">
              <label>
                层数
                <input
                  required
                  type="number"
                  min={1}
                  max={100}
                  value={edit.row}
                  onChange={(e) => setEdit({ ...edit, row: +e.target.value })}
                />
              </label>
              <label>
                从左数位置
                <input
                  required
                  type="number"
                  min={1}
                  max={100}
                  value={edit.position}
                  onChange={(e) =>
                    setEdit({ ...edit, position: +e.target.value })
                  }
                />
              </label>
            </div>
            <label>
              书脊颜色
              <input
                type="color"
                value={edit.coverColor}
                onChange={(e) =>
                  setEdit({ ...edit, coverColor: e.target.value })
                }
              />
            </label>
            <label>
              阅读笔记
              <textarea
                maxLength={5000}
                rows={4}
                value={edit.notes || ""}
                onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
              />
            </label>
            <button className="primary">保存档案</button>
          </form>
        )}
      </dialog>
    </div>
  );
}
