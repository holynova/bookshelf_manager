import { useState, useEffect, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Library, 
  Plus, 
  Search, 
  Settings as SettingsIcon, 
  Sun, 
  Moon, 
  Camera, 
  Upload, 
  Trash2, 
  Edit, 
  BookOpen, 
  ExternalLink, 
  Check, 
  ArrowRight,
  TrendingUp,
  Bookmark,
  Layers,
  Sparkles,
  Info
} from 'lucide-react';
import { db, seedDemoData, type Book } from './db';
import { scanBookshelfPhoto, type LLMBookResult } from './llm';

function App() {
  // Navigation & Theme
  const [activeTab, setActiveTab] = useState<'dashboard' | 'shelves' | 'library' | 'scan' | 'settings'>('dashboard');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  // DB Data
  const shelves = useLiveQuery(() => db.shelves.toArray()) || [];
  const books = useLiveQuery(() => db.books.toArray()) || [];

  // API Config (stored in localStorage)
  const [apiBaseUrl, setApiBaseUrl] = useState<string>(() => localStorage.getItem('llm_api_base') || 'https://api.openai.com/v1');
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('llm_api_key') || '');
  const [apiModelName, setApiModelName] = useState<string>(() => localStorage.getItem('llm_model') || 'gpt-4o-mini');
  const [customPrompt, setCustomPrompt] = useState<string>(() => localStorage.getItem('llm_prompt') || `你是一个专业的图书管理员和图像识别专家。请分析用户提供的书架照片，识别出书架上的所有书籍，并以 JSON 格式输出。

你需要仔细识别：
1. 书名 (title)：识别每本书的书名。
2. 作者 (author)：识别作者名字。
3. 简介 (description)：简短介绍该书的核心内容或背景。
4. 封面主色调 (coverColor)：识别书脊或封面的主色调，必须为标准的 6 位 HEX 颜色代码（如 #2d6a4f, #d62246）。
5. 行数 (row)：书架上的排数，从上到下依次为 1, 2, 3...
6. 位置 (position)：在该排中从左到右的顺序，依次为 1, 2, 3...
7. 估算评分 (rating)：基于书籍知名度和口碑，给出 0.0 到 10.0 之间的评分。

请确保输出格式为合法的 JSON 对象，包含 "books" 数组。`);
  const [useDemoMode, setUseDemoMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('llm_demo_mode');
    return saved === null ? true : saved === 'true';
  });

  // Selected State
  const [activeShelfId, setActiveShelfId] = useState<number | null>(null);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [editingBook, setEditingBook] = useState<Book | null>(null);

  // Scan & Upload Flow
  const [scanShelfId, setScanShelfId] = useState<string>('new');
  const [newShelfName, setNewShelfName] = useState<string>('');
  const [newShelfDesc, setNewShelfDesc] = useState<string>('');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState<boolean>(false);
  const [scanLogs, setScanLogs] = useState<string[]>([]);
  const [scanResultBooks, setScanResultBooks] = useState<LLMBookResult[]>([]);
  const [isConfirmingScan, setIsConfirmingScan] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Library Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterShelfId, setFilterShelfId] = useState<string>('all');
  const [filterDigitized, setFilterDigitized] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('rating-desc');

  // Initialize: Set HTML data-theme attribute and seed demo data on first launch
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const initDb = async () => {
      await seedDemoData();
      // Set the first shelf as active by default if none is set
      const allShelves = await db.shelves.toArray();
      if (allShelves.length > 0 && activeShelfId === null) {
        setActiveShelfId(allShelves[0].id || null);
      }
    };
    initDb();
  }, []);

  // Update localStorage when configuration changes
  useEffect(() => {
    localStorage.setItem('llm_api_base', apiBaseUrl);
  }, [apiBaseUrl]);

  useEffect(() => {
    localStorage.setItem('llm_api_key', apiKey);
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem('llm_model', apiModelName);
  }, [apiModelName]);

  useEffect(() => {
    localStorage.setItem('llm_prompt', customPrompt);
  }, [customPrompt]);

  useEffect(() => {
    localStorage.setItem('llm_demo_mode', String(useDemoMode));
  }, [useDemoMode]);

  // Sync active shelf selector with database changes
  useEffect(() => {
    if (shelves.length > 0 && activeShelfId === null) {
      setActiveShelfId(shelves[0].id || null);
    }
  }, [shelves]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // --- STATS CALCULATIONS ---
  const stats = useMemo(() => {
    if (books.length === 0) {
      return { total: 0, digitized: 0, ratio: 0, avgRating: 0 };
    }
    const total = books.length;
    const digitized = books.filter(b => b.isDigitized).length;
    const ratio = Math.round((digitized / total) * 100);
    
    const ratedBooks = books.filter(b => b.rating > 0);
    const avgRating = ratedBooks.length > 0
      ? Number((ratedBooks.reduce((sum, b) => sum + b.rating, 0) / ratedBooks.length).toFixed(1))
      : 0;

    return { total, digitized, ratio, avgRating };
  }, [books]);

  // --- FILTERED BOOKS ---
  const filteredBooks = useMemo(() => {
    let result = [...books];

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(b => 
        b.title.toLowerCase().includes(q) || 
        b.author.toLowerCase().includes(q) || 
        b.description.toLowerCase().includes(q)
      );
    }

    // Shelf Filter
    if (filterShelfId !== 'all') {
      result = result.filter(b => b.shelfId === Number(filterShelfId));
    }

    // Digitized Filter
    if (filterDigitized !== 'all') {
      const isDig = filterDigitized === 'yes';
      result = result.filter(b => b.isDigitized === isDig);
    }

    // Sorting
    result.sort((a, b) => {
      if (sortBy === 'title-asc') return a.title.localeCompare(b.title);
      if (sortBy === 'title-desc') return b.title.localeCompare(a.title);
      if (sortBy === 'rating-desc') return b.rating - a.rating;
      if (sortBy === 'rating-asc') return a.rating - b.rating;
      if (sortBy === 'position') {
        if (a.shelfId !== b.shelfId) return a.shelfId - b.shelfId;
        if (a.row !== b.row) return a.row - b.row;
        return a.position - b.position;
      }
      return b.createdAt - a.createdAt; // Default to newest
    });

    return result;
  }, [books, searchQuery, filterShelfId, filterDigitized, sortBy]);

  // --- SCAN PROCESSING ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadedFile(file);
      const reader = new FileReader();
      reader.onload = () => {
        setUploadedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setUploadedFile(file);
      const reader = new FileReader();
      reader.onload = () => {
        setUploadedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const loadDemoImageForScan = async () => {
    setUploadedImage('/demo_bookshelf.jpg');
    // Load mock file
    try {
      const response = await fetch('/demo_bookshelf.jpg');
      const blob = await response.blob();
      const file = new File([blob], 'demo_bookshelf.jpg', { type: 'image/jpeg' });
      setUploadedFile(file);
    } catch (e) {
      console.error('Failed to load demo file', e);
    }
  };

  const runScanning = async () => {
    if (!uploadedFile && !uploadedImage) return;
    if (!useDemoMode && !apiKey) {
      alert('请先在偏好设置中配置 API Key，或启用 Demo 演示模式。');
      setActiveTab('settings');
      return;
    }

    setScanning(true);
    setScanLogs([]);

    const logMessages = [
      '正在读取书架照片数据...',
      '正在分析照片边缘与书架隔板结构...',
      '正在检测书脊边框与物理顺序...',
      '正在上传图片及提示词至 AI 大模型 (Chat Completions)...',
      '正在由大模型提取书名、作者与颜色版本特征...',
      '正在聚合书籍豆瓣评分与内容百科信息...'
    ];

    // Simulate logs appearing over time
    for (let i = 0; i < logMessages.length; i++) {
      setScanLogs(prev => [...prev, logMessages[i]]);
      await new Promise(r => setTimeout(r, 600));
    }

    try {
      // If we are scanning a real file, use it. Otherwise, fetch the image from URL (like the demo path)
      let blobToScan: Blob | null = uploadedFile;
      if (!blobToScan && uploadedImage) {
        const res = await fetch(uploadedImage);
        blobToScan = await res.blob();
      }

      const result = await scanBookshelfPhoto(
        blobToScan,
        apiBaseUrl,
        apiKey,
        apiModelName,
        customPrompt,
        useDemoMode
      );
      setScanResultBooks(result.books);
      setIsConfirmingScan(true);
    } catch (error: any) {
      alert(`扫描识别失败: ${error?.message || error}`);
    } finally {
      setScanning(false);
    }
  };

  const handleSaveScanResult = async () => {
    let targetShelfId: number;

    if (scanShelfId === 'new') {
      if (!newShelfName.trim()) {
        alert('请输入新书架名称');
        return;
      }
      const addedId = await db.shelves.add({
        name: newShelfName.trim(),
        description: newShelfDesc.trim(),
        photoUrl: uploadedImage || undefined,
        createdAt: Date.now()
      });
      targetShelfId = addedId as number;
    } else {
      targetShelfId = Number(scanShelfId);
      // Update existing shelf's photo if provided
      if (uploadedImage) {
        await db.shelves.update(targetShelfId, {
          photoUrl: uploadedImage
        });
      }
      
      // If rescanning/updating existing shelf, delete previous books on this shelf
      // or archive them. Here we overwrite the location mapping.
      const existingBooks = await db.books.where('shelfId').equals(targetShelfId).toArray();
      await db.books.bulkDelete(existingBooks.map(b => b.id!));
    }

    // Add new books
    const booksToInsert: Omit<Book, 'id'>[] = scanResultBooks.map(b => ({
      shelfId: targetShelfId,
      row: b.row,
      position: b.position,
      title: b.title,
      author: b.author,
      description: b.description,
      coverColor: b.coverColor,
      rating: b.rating,
      doubanLink: `https://search.douban.com/book/subject_search?search_text=${encodeURIComponent(b.title)}`,
      wereadLink: `https://weread.qq.com/web/search/query?keywords=${encodeURIComponent(b.title)}`,
      taobaoLink: `https://s.taobao.com/search?q=${encodeURIComponent(b.title)}`,
      isDigitized: true,
      createdAt: Date.now()
    }));

    await db.books.bulkAdd(booksToInsert as Book[]);

    // Reset scan state
    setUploadedImage(null);
    setUploadedFile(null);
    setScanResultBooks([]);
    setIsConfirmingScan(false);
    setNewShelfName('');
    setNewShelfDesc('');
    
    // Navigate to Virtual Shelf
    setActiveShelfId(targetShelfId);
    setActiveTab('shelves');
  };

  // --- BOOK CRUD ACTIONS ---
  const toggleBookDigitized = async (book: Book) => {
    if (!book.id) return;
    await db.books.update(book.id, {
      isDigitized: !book.isDigitized
    });
    // Sync active details if open
    if (selectedBook && selectedBook.id === book.id) {
      setSelectedBook(prev => prev ? { ...prev, isDigitized: !prev.isDigitized } : null);
    }
  };

  const handleUpdateBookDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBook || !editingBook.id) return;

    await db.books.update(editingBook.id, {
      title: editingBook.title,
      author: editingBook.author,
      description: editingBook.description,
      rating: Number(editingBook.rating),
      coverColor: editingBook.coverColor,
      row: Number(editingBook.row),
      position: Number(editingBook.position)
    });

    // Update local modal view
    setSelectedBook(editingBook);
    setEditingBook(null);
  };

  const handleDeleteBook = async (bookId: number) => {
    if (confirm('确定要删除这本书籍的记录吗？此操作不可逆。')) {
      await db.books.delete(bookId);
      setSelectedBook(null);
    }
  };

  const handleClearDatabase = async () => {
    if (confirm('警告：确定要清空所有书架和书籍数据吗？')) {
      await db.shelves.clear();
      await db.books.clear();
      setActiveShelfId(null);
      alert('数据库已清空');
    }
  };

  const handleResetDemoData = async () => {
    if (confirm('确定要重置并加载初始演示数据吗？这会清空当前的数据。')) {
      await db.shelves.clear();
      await db.books.clear();
      await seedDemoData();
      const allShelves = await db.shelves.toArray();
      if (allShelves.length > 0) {
        setActiveShelfId(allShelves[0].id || null);
      }
      alert('演示数据已重置加载！');
    }
  };

  // Render Helper: Star Ratings
  const renderStars = (rating: number) => {
    const starCount = Math.round(rating / 2);
    return (
      <span style={{ color: 'var(--warning)', fontWeight: 600 }}>
        {'★'.repeat(starCount)}{'☆'.repeat(5 - starCount)}
        <span style={{ fontSize: '0.8rem', marginLeft: '0.25rem', color: 'var(--text-muted)' }}>
          ({rating})
        </span>
      </span>
    );
  };

  // Render Helper: Visual Bookshelf Row
  const renderVisualRow = (rowNum: number, rowBooks: Book[]) => {
    // Generate height variance based on index/ID for organic natural feeling
    const getBookStyles = (book: Book, index: number) => {
      const idSeed = book.id || index;
      const height = 135 + ((idSeed * 17) % 45); // Height: 135px to 180px
      const width = 26 + ((idSeed * 7) % 20);    // Width: 26px to 46px
      const tilt = (idSeed % 11 === 0) ? ((idSeed % 3) - 1) * 3 : 0; // Slight tilt for every 11th book
      
      return {
        height: `${height}px`,
        width: `${width}px`,
        backgroundColor: book.coverColor,
        transform: tilt ? `rotate(${tilt}deg)` : undefined,
        borderLeft: `3px solid rgba(255,255,255,${book.isDigitized ? 0.2 : 0.05})`
      };
    };

    return (
      <div className="shelf-row" key={rowNum}>
        {rowBooks.length === 0 ? (
          <div className="empty-shelf-row">该排暂无书脊记录，请上传照片扫描</div>
        ) : (
          rowBooks.map((book, idx) => (
            <div 
              className="book-spine" 
              key={book.id || idx} 
              style={getBookStyles(book, idx)}
              title={`${book.title} - ${book.author}`}
              onClick={() => setSelectedBook(book)}
            >
              <div className="book-spine-inner">
                {book.title}
              </div>
            </div>
          ))
        )}
        <div className="shelf-row-label">第 {rowNum} 排</div>
      </div>
    );
  };

  return (
    <div className="app-container">
      {/* SIDEBAR NAVIGATION */}
      <aside className="sidebar">
        <div>
          <div className="logo-container">
            <div className="logo-icon">
              <BookOpen size={22} />
            </div>
            <div>
              <h2 className="logo-text">
                书香管家 <span className="logo-tag">V1.0</span>
              </h2>
            </div>
          </div>

          <nav className="nav-links">
            <button 
              className={`nav-button ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <TrendingUp size={18} />
              数据大盘
            </button>
            <button 
              className={`nav-button ${activeTab === 'shelves' ? 'active' : ''}`}
              onClick={() => setActiveTab('shelves')}
            >
              <Layers size={18} />
              虚拟书架
            </button>
            <button 
              className={`nav-button ${activeTab === 'library' ? 'active' : ''}`}
              onClick={() => setActiveTab('library')}
            >
              <Library size={18} />
              书籍档案
            </button>
            <button 
              className={`nav-button ${activeTab === 'scan' ? 'active' : ''}`}
              onClick={() => setActiveTab('scan')}
            >
              <Camera size={18} />
              扫描整理
            </button>
          </nav>
        </div>

        <div className="sidebar-footer">
          <button 
            className={`nav-button ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <SettingsIcon size={18} />
            偏好设置
          </button>
          <a 
            href="https://github.com/holynova/bookshelf_manager" 
            target="_blank" 
            rel="noreferrer" 
            className="nav-button"
            style={{ textDecoration: 'none' }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
            </svg>
            项目源码
          </a>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>
              {theme === 'dark' ? '深色模式' : '浅色模式'}
            </span>
            <button className="theme-toggle-btn" onClick={toggleTheme}>
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTAINER WORKSPACE */}
      <main className="main-workspace">
        
        {/* HEADER SECTION */}
        <header className="workspace-header">
          <div className="header-title-section">
            {activeTab === 'dashboard' && (
              <>
                <h1>您的数字化书斋</h1>
                <p>利用人工智能扫描整理您的物理藏书，构建书籍索引</p>
              </>
            )}
            {activeTab === 'shelves' && (
              <>
                <h1>书架虚拟视窗</h1>
                <p>还原书籍在物理空间中的排列位置与外观色调</p>
              </>
            )}
            {activeTab === 'library' && (
              <>
                <h1>藏书电子档案</h1>
                <p>查询、检索、排序和归档您的电子化书籍档案</p>
              </>
            )}
            {activeTab === 'scan' && (
              <>
                <h1>AI 拍照扫描整理</h1>
                <p>上传或拍摄一张书架的正面照片，自动识别排布与封面颜色</p>
              </>
            )}
            {activeTab === 'settings' && (
              <>
                <h1>偏好设置 & 管理</h1>
                <p>配置大模型 API 接口与提示词，重置或清理本地数据库</p>
              </>
            )}
          </div>

          <div className="header-actions">
            {activeTab !== 'scan' && (
              <button className="btn btn-primary" onClick={() => {
                setScanShelfId(shelves[0]?.id ? String(shelves[0].id) : 'new');
                setActiveTab('scan');
              }}>
                <Plus size={16} />
                扫描新书架
              </button>
            )}
          </div>
        </header>

        {/* --- VIEW: DASHBOARD --- */}
        {activeTab === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Stats Summary Cards */}
            <div className="stats-grid">
              <div className="card stat-card">
                <div className="stat-info">
                  <h3>物理书架数</h3>
                  <div className="stat-value">{shelves.length} 个</div>
                </div>
                <div className="stat-icon">
                  <Layers size={22} />
                </div>
              </div>
              <div className="card stat-card">
                <div className="stat-info">
                  <h3>总藏书量</h3>
                  <div className="stat-value">{stats.total} 本</div>
                </div>
                <div className="stat-icon">
                  <Bookmark size={22} />
                </div>
              </div>
              <div className="card stat-card">
                <div className="stat-info">
                  <h3>已归档比例</h3>
                  <div className="stat-value">{stats.ratio}%</div>
                </div>
                <div className="stat-icon" style={{ backgroundColor: 'var(--success-light)', color: 'var(--success)' }}>
                  <Check size={22} />
                </div>
              </div>
              <div className="card stat-card">
                <div className="stat-info">
                  <h3>馆藏均分</h3>
                  <div className="stat-value">⭐ {stats.avgRating}</div>
                </div>
                <div className="stat-icon" style={{ backgroundColor: 'hsla(38, 92%, 50%, 0.15)', color: 'var(--warning)' }}>
                  <Sparkles size={22} />
                </div>
              </div>
            </div>

            {/* Quick Actions & Introduction */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', justifyContent: 'space-between' }}>
                <div>
                  <h2 style={{ fontSize: '1.4rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Sparkles size={20} style={{ color: 'var(--primary)' }} />
                    AI 智能整理指南
                  </h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '1rem' }}>
                    本系统支持接入任意 OpenAI 兼容的多模态大模型。只需上传一张完整的书架侧拍或正拍照片：
                  </p>
                  <ul style={{ paddingLeft: '1.25rem', color: 'var(--text-muted)', fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <li>自动锁定各排的排列结构（自上而下，自左向右）。</li>
                    <li>识别书籍的名称与作者，估计豆瓣评分并附赠链接。</li>
                    <li>抽取封面脊梁主色调，渲染三维虚拟书架，点对点找书更直观。</li>
                  </ul>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button className="btn btn-primary" onClick={() => setActiveTab('scan')}>
                    拍摄/上传书架
                    <ArrowRight size={16} />
                  </button>
                  {useDemoMode && (
                    <button className="btn btn-secondary" onClick={() => {
                      setUseDemoMode(true);
                      setScanShelfId('new');
                      loadDemoImageForScan();
                      setActiveTab('scan');
                    }}>
                      体验 Demo 演示
                    </button>
                  )}
                </div>
              </div>

              {/* Recent Additions Card */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h2 style={{ fontSize: '1.4rem' }}>最新扫描录入</h2>
                {books.length === 0 ? (
                  <div style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-light)', fontStyle: 'italic' }}>
                    暂无藏书数据。请在“扫描整理”中上传照片。
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {books.slice(-4).reverse().map((book, idx) => (
                      <div 
                        key={book.id || idx} 
                        className="scan-book-item-card" 
                        style={{ cursor: 'pointer', background: 'rgba(0,0,0,0.02)' }}
                        onClick={() => setSelectedBook(book)}
                      >
                        <div className="scan-book-item-color" style={{ backgroundColor: book.coverColor, width: '20px', height: '32px' }} />
                        <div style={{ flexGrow: 1 }}>
                          <h4 style={{ fontSize: '0.95rem', fontWeight: 600 }}>{book.title}</h4>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{book.author}</p>
                        </div>
                        <span style={{ fontSize: '0.8rem', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', padding: '0.2rem 0.5rem', borderRadius: '6px' }}>
                          Row {book.row}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* --- VIEW: VIRTUAL SHELVES --- */}
        {activeTab === 'shelves' && (
          <div>
            {shelves.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                <Layers size={48} style={{ color: 'var(--text-light)', marginBottom: '1.5rem' }} />
                <h2 style={{ marginBottom: '0.5rem' }}>暂无虚拟书架</h2>
                <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                  您还没有创建书架档案。请使用扫描整理上传图片，AI 将自动分析并创建您的第一个书架。
                </p>
                <button className="btn btn-primary" onClick={() => setActiveTab('scan')}>
                  立即扫描书架
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {/* Selector Header */}
                <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <label style={{ fontWeight: 600, fontSize: '0.95rem' }}>选择查看的书架：</label>
                    <select 
                      className="select-filter" 
                      value={activeShelfId || ''} 
                      onChange={(e) => setActiveShelfId(Number(e.target.value))}
                    >
                      {shelves.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  {activeShelfId && (
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <button className="btn btn-secondary" onClick={() => {
                        setScanShelfId(String(activeShelfId));
                        // Set image URL to re-scan
                        const currentShelf = shelves.find(s => s.id === activeShelfId);
                        if (currentShelf?.photoUrl) {
                          setUploadedImage(currentShelf.photoUrl);
                        }
                        setActiveTab('scan');
                      }}>
                        <Camera size={16} />
                        更新此书架拍照
                      </button>
                      <button className="btn btn-danger" style={{ padding: '0.5rem' }} onClick={async () => {
                        if (confirm(`确定要删除书架“${shelves.find(s => s.id === activeShelfId)?.name}”及架上所有书籍吗？`)) {
                          await db.books.where('shelfId').equals(activeShelfId).delete();
                          await db.shelves.delete(activeShelfId);
                          const rem = await db.shelves.toArray();
                          setActiveShelfId(rem.length > 0 ? rem[0].id || null : null);
                        }
                      }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>

                {/* The Virtual Wood Shelf */}
                {activeShelfId && (
                  <div className="shelf-wrapper">
                    {(() => {
                      const shelf = shelves.find(s => s.id === activeShelfId);
                      const shelfBooks = books.filter(b => b.shelfId === activeShelfId);
                      
                      // Find unique row indices, sorted. E.g. [1, 2]
                      const rows = Array.from(new Set(shelfBooks.map(b => b.row))).sort((a,b)=>a-b);
                      // Make sure we render at least 2 rows even if empty
                      const displayRows = rows.length > 0 ? rows : [1, 2];

                      return (
                        <div className="shelf-visual-board">
                          <div className="shelf-header">
                            <div className="shelf-meta">
                              <h2>{shelf?.name}</h2>
                              <p>{shelf?.description || '暂无描述'}</p>
                            </div>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-light)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <Info size={14} />
                              点击书脊可查看详细档案、快捷豆瓣/电子书链接
                            </span>
                          </div>

                          {displayRows.map(rNum => {
                            const rowBooks = shelfBooks
                              .filter(b => b.row === rNum)
                              .sort((a, b) => a.position - b.position);
                            return renderVisualRow(rNum, rowBooks);
                          })}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* --- VIEW: LIBRARY (GRID / TABLE) --- */}
        {activeTab === 'library' && (
          <div>
            {/* Filters bar */}
            <div className="card library-filters">
              <div className="search-wrapper">
                <Search size={18} className="search-icon" />
                <input 
                  type="text" 
                  className="form-input search-input" 
                  placeholder="搜索书名、作者或简介..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <select 
                className="select-filter"
                value={filterShelfId}
                onChange={(e) => setFilterShelfId(e.target.value)}
              >
                <option value="all">所有书架</option>
                {shelves.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>

              <select 
                className="select-filter"
                value={filterDigitized}
                onChange={(e) => setFilterDigitized(e.target.value)}
              >
                <option value="all">所有归档状态</option>
                <option value="yes">已数字化确认</option>
                <option value="no">未数字化确认</option>
              </select>

              <select 
                className="select-filter"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="rating-desc">评分从高到低</option>
                <option value="rating-asc">评分从低到高</option>
                <option value="title-asc">书名 (A-Z)</option>
                <option value="title-desc">书名 (Z-A)</option>
                <option value="position">按物理位置排布</option>
              </select>
            </div>

            {/* Books Table */}
            {filteredBooks.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                <p style={{ color: 'var(--text-light)', fontStyle: 'italic' }}>
                  没有找到符合过滤条件的书籍记录。
                </p>
              </div>
            ) : (
              <div className="books-table-wrapper">
                <table className="books-table">
                  <thead>
                    <tr>
                      <th>书籍</th>
                      <th>作者</th>
                      <th>所属书架位置</th>
                      <th>豆瓣评分</th>
                      <th>状态</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBooks.map((book) => {
                      const shelf = shelves.find(s => s.id === book.shelfId);
                      return (
                        <tr key={book.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <span 
                                className="table-color-dot" 
                                style={{ backgroundColor: book.coverColor }}
                              />
                              <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                                {book.title}
                              </span>
                            </div>
                          </td>
                          <td style={{ color: 'var(--text-muted)' }}>{book.author}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            {shelf?.name || '未知书架'} (第 {book.row} 排, 位 {book.position})
                          </td>
                          <td>{renderStars(book.rating)}</td>
                          <td>
                            <button 
                              className="badge" 
                              style={{ 
                                cursor: 'pointer',
                                border: 'none',
                                backgroundColor: book.isDigitized ? 'var(--success-light)' : 'rgba(0,0,0,0.05)',
                                color: book.isDigitized ? 'var(--success)' : 'var(--text-muted)'
                              }}
                              onClick={() => toggleBookDigitized(book)}
                            >
                              {book.isDigitized ? '已数字化' : '未归档'}
                            </button>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button 
                                className="btn btn-secondary" 
                                style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
                                onClick={() => setSelectedBook(book)}
                              >
                                详情
                              </button>
                              <button 
                                className="btn btn-secondary" 
                                style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
                                onClick={() => {
                                  setEditingBook(book);
                                }}
                              >
                                <Edit size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* --- VIEW: AI SCANNER --- */}
        {activeTab === 'scan' && (
          <div className="scan-container">
            {/* Control Panel / Upload Zone */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <h2 style={{ fontSize: '1.4rem' }}>
                {isConfirmingScan ? '第二步：核对并确认书籍排布' : '第一步：上传书架照片'}
              </h2>

              {!isConfirmingScan ? (
                <>
                  <div className="form-group">
                    <label>归档至书架：</label>
                    <select 
                      className="select-filter"
                      value={scanShelfId}
                      onChange={(e) => setScanShelfId(e.target.value)}
                    >
                      <option value="new">+ 扫描存为新书架...</option>
                      {shelves.map(s => (
                        <option key={s.id} value={s.id}>更新已有：{s.name}</option>
                      ))}
                    </select>
                  </div>

                  {scanShelfId === 'new' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div className="form-group">
                        <label>新书架名称：</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          placeholder="例如：客厅左侧木书架" 
                          value={newShelfName}
                          onChange={(e) => setNewShelfName(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label>描述/位置备注：</label>
                        <textarea 
                          className="form-input form-textarea" 
                          placeholder="备注说明，方便今后定位找书..." 
                          value={newShelfDesc}
                          onChange={(e) => setNewShelfDesc(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {/* Dropzone area */}
                  <div 
                    className="dropzone-card"
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onClick={triggerFileSelect}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      style={{ display: 'none' }} 
                      accept="image/*"
                      onChange={handleFileChange}
                    />
                    <div className="dropzone-icon">
                      <Upload size={28} />
                    </div>
                    <div className="dropzone-text">
                      <h3>将书架正面照片拖到此处，或点击上传</h3>
                      <p>支持 JPG, PNG, WEBP。为保证书籍识别率，建议正面无倾角垂直拍摄。</p>
                    </div>
                    {uploadedFile && (
                      <span className="badge badge-location">
                        已选择: {uploadedFile.name}
                      </span>
                    )}
                  </div>

                  {/* Demo Trigger */}
                  {useDemoMode && (
                    <button className="btn btn-secondary" onClick={loadDemoImageForScan}>
                      💡 加载预置 Demo 照片 (免 API Key 测试)
                    </button>
                  )}

                  {uploadedImage && (
                    <button 
                      className="btn btn-primary" 
                      onClick={runScanning}
                      disabled={scanning}
                    >
                      {scanning ? '分析识别中...' : '开始 AI 识别整理'}
                    </button>
                  )}
                </>
              ) : (
                /* Edit and confirm parsed results */
                <div className="scan-confirmation-container">
                  <div className="demo-banner">
                    <Info size={16} />
                    <div>
                      <strong>核对信息：</strong> 以下是 Gemini 识别出的书籍排布（从上至下，从左至右）。您可以对内容进行增删或微调。
                    </div>
                  </div>

                  <div className="scan-confirmation-list">
                    {scanResultBooks.map((item, index) => (
                      <div className="scan-book-item-card" key={index}>
                        <input 
                          type="color" 
                          value={item.coverColor} 
                          onChange={(e) => {
                            const updated = [...scanResultBooks];
                            updated[index].coverColor = e.target.value;
                            setScanResultBooks(updated);
                          }}
                          style={{
                            width: '32px',
                            height: '48px',
                            border: 'none',
                            cursor: 'pointer',
                            borderRadius: '4px',
                            backgroundColor: 'transparent'
                          }}
                        />
                        <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <input 
                            type="text" 
                            className="form-input" 
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.9rem', fontWeight: 600 }}
                            value={item.title}
                            onChange={(e) => {
                              const updated = [...scanResultBooks];
                              updated[index].title = e.target.value;
                              setScanResultBooks(updated);
                            }}
                          />
                          <input 
                            type="text" 
                            className="form-input" 
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}
                            value={item.author}
                            onChange={(e) => {
                              const updated = [...scanResultBooks];
                              updated[index].author = e.target.value;
                              setScanResultBooks(updated);
                            }}
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-end' }}>
                          <span className="scan-book-item-pos">
                            Row {item.row} - Pos {item.position}
                          </span>
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '0.25rem', color: 'var(--danger)' }}
                            onClick={() => {
                              setScanResultBooks(prev => prev.filter((_, i) => i !== index));
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                    <button className="btn btn-secondary" onClick={() => setIsConfirmingScan(false)}>
                      重新上传
                    </button>
                    <button className="btn btn-primary" style={{ flexGrow: 1 }} onClick={handleSaveScanResult}>
                      确认，并存入书架档案
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Realtime Camera Preview Frame & Logs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className="card" style={{ padding: '1rem' }}>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>书架照预览</h3>
                <div className="camera-preview-frame">
                  {uploadedImage ? (
                    <>
                      <img src={uploadedImage} className="camera-preview-img" alt="Bookshelf preview" />
                      {scanning && <div className="scanner-beam" />}
                      {scanning && (
                        <div className="scanner-overlay">
                          <div className="spinner" />
                          <span>AI 正在识别整理书籍...</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-light)',
                      backgroundColor: 'rgba(0,0,0,0.03)',
                      gap: '0.5rem'
                    }}>
                      <Camera size={36} />
                      <span style={{ fontSize: '0.9rem' }}>暂无照片，请先在左侧选择上传</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Realtime AI parsing logs */}
              {scanning && (
                <div className="card">
                  <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>AI 分析日志</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '150px', overflowY: 'auto' }}>
                    {scanLogs.map((log, idx) => (
                      <div 
                        key={idx} 
                        style={{ 
                          fontSize: '0.85rem', 
                          color: idx === scanLogs.length - 1 ? 'var(--primary)' : 'var(--text-muted)',
                          fontWeight: idx === scanLogs.length - 1 ? 600 : 400,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem'
                        }}
                      >
                        {idx === scanLogs.length - 1 ? <div className="spinner spinner-primary" style={{ width: '12px', height: '12px', borderWidth: '1.5px' }} /> : '✓'}
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- VIEW: SETTINGS --- */}
        {activeTab === 'settings' && (
          <div className="settings-container card">
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              应用程序设置
            </h2>

            {/* Demo Mode settings */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>Demo 演示模式 (推荐首次使用)</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    启用后，上传书架照片时无需调用真实 API Key，系统将自动使用预设的精美书籍数据，以便立即感受完整功能。
                  </p>
                </div>
                <input 
                  type="checkbox" 
                  checked={useDemoMode} 
                  onChange={(e) => setUseDemoMode(e.target.checked)}
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                />
              </div>

              {useDemoMode ? (
                <div className="demo-banner">
                  <Check size={16} />
                  <span>已启用演示模式，扫描界面会自动提供预置的示例照片供快速导入。</span>
                </div>
              ) : (
                <div className="demo-banner inactive">
                  <Info size={16} />
                  <span>已停用演示模式，您将直接使用 OpenAI 兼容 API 发送图片。</span>
                </div>
              )}
            </div>

            {/* API Config settings */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', opacity: useDemoMode ? 0.5 : 1 }}>
              <h3 style={{ fontSize: '1.2rem', color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                OpenAI 兼容大模型配置
              </h3>
              
              <div className="form-group">
                <label>API Base URL：</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="https://api.openai.com/v1" 
                  value={apiBaseUrl}
                  onChange={(e) => setApiBaseUrl(e.target.value)}
                  disabled={useDemoMode}
                />
                <span className="form-help">
                  您的 API 提供商的基础 URL (Base URL)，例如 <code>https://api.openai.com/v1</code> 或 <code>https://api.deepseek.com/v1</code>。如果是本地运行的 Ollama，通常是 <code>http://localhost:11434/v1</code>。
                </span>
              </div>

              <div className="form-group">
                <label>API Key：</label>
                <input 
                  type="password" 
                  className="form-input" 
                  placeholder="请输入您的 API Key (如 sk-...)" 
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  disabled={useDemoMode}
                />
                <span className="form-help">
                  用于进行 API 请求的鉴权密钥。该密钥仅保存在您的本地浏览器中，绝不会上传到任何第三方服务器。
                </span>
              </div>

              <div className="form-group">
                <label>模型名称 (Model Name)：</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="gpt-4o-mini" 
                  value={apiModelName}
                  onChange={(e) => setApiModelName(e.target.value)}
                  disabled={useDemoMode}
                />
                <span className="form-help">
                  要调用的多模态模型名称，例如 <code>gpt-4o-mini</code>, <code>gpt-4o</code>, 或本地运行的 <code>llava</code> 等。<strong>请确保所选模型支持图片输入。</strong>
                </span>
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label>识别提示词 (Prompt)：</label>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
                    onClick={() => {
                      if (confirm('确定要恢复默认提示词吗？')) {
                        setCustomPrompt(`你是一个专业的图书管理员和图像识别专家。请分析用户提供的书架照片，识别出书架上的所有书籍，并以 JSON 格式输出。

你需要仔细识别：
1. 书名 (title)：识别每本书的书名。
2. 作者 (author)：识别作者名字。
3. 简介 (description)：简短介绍该书的核心内容或背景。
4. 封面主色调 (coverColor)：识别书脊或封面的主色调，必须为标准的 6 位 HEX 颜色代码（如 #2d6a4f, #d62246）。
5. 行数 (row)：书架上的排数，从上到下依次为 1, 2, 3...
6. 位置 (position)：在该排中从左到右的顺序，依次为 1, 2, 3...
7. 估算评分 (rating)：基于书籍知名度和口碑，给出 0.0 到 10.0 之间的评分。

请确保输出格式为合法的 JSON 对象，包含 "books" 数组。`);
                      }
                    }}
                    disabled={useDemoMode}
                  >
                    恢复默认
                  </button>
                </div>
                <textarea 
                  className="form-input form-textarea" 
                  style={{ height: '180px', fontFamily: 'monospace', fontSize: '0.9rem' }}
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  disabled={useDemoMode}
                />
                <span className="form-help">
                  微调发送给大模型的提示词，使其按您需要的方式或特殊语言习惯识别书脊和书籍信息。
                </span>
              </div>

              {/* CORS Warning Alert Block */}
              <div className="demo-banner inactive" style={{ borderLeftColor: 'var(--warning)', background: 'hsla(38, 92%, 50%, 0.05)', color: 'var(--text-main)', marginTop: '0.5rem' }}>
                <Info size={18} style={{ color: 'var(--warning)', flexShrink: 0 }} />
                <div style={{ fontSize: '0.85rem', lineHeight: '1.5' }}>
                  <strong>⚠️ CORS 跨域限制提示：</strong>
                  <br />
                  由于本应用是一个纯前端网页（运行在浏览器中），向自定义 API 地址发起请求时可能会触发浏览器的 CORS (跨域资源共享) 限制。
                  <ul>
                    <li><strong>本地 Ollama：</strong> 启动时请通过环境变量启用跨域，例如 Mac/Linux 下运行 <code>OLLAMA_ORIGINS="*" ollama serve</code>。</li>
                    <li><strong>本地 LM Studio / LocalAI：</strong> 请在设置中开启“Enable CORS”选项。</li>
                    <li><strong>在线 API / 代理：</strong> 请确保您的 API 代理提供商的服务器配置了 <code>Access-Control-Allow-Origin: *</code> 响应头。</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* DB tools */}
            <div style={{ marginTop: '2rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--text-main)' }}>数据维护工具</h3>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <button className="btn btn-secondary" onClick={handleResetDemoData}>
                  重置并加载初始演示数据
                </button>
                <button className="btn btn-danger" onClick={handleClearDatabase}>
                  清空所有本地数据
                </button>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* --- MODAL: BOOK DETAILS --- */}
      {selectedBook && !editingBook && (
        <div className="modal-overlay" onClick={() => setSelectedBook(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>书籍详细档案</h3>
              <button 
                className="btn btn-secondary" 
                style={{ padding: '0.25rem 0.5rem', border: 'none' }}
                onClick={() => setSelectedBook(null)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="book-detail-layout">
                {/* Simulated vertical cover spine */}
                <div 
                  className="book-detail-cover-spine" 
                  style={{ 
                    backgroundColor: selectedBook.coverColor,
                    borderLeft: '5px solid rgba(255,255,255,0.2)'
                  }}
                >
                  <div style={{ writingMode: 'vertical-rl', letterSpacing: '4px', fontSize: '0.9rem', color: 'white', fontWeight: 700 }}>
                    {selectedBook.title}
                  </div>
                </div>

                <div className="book-detail-info">
                  <h2>{selectedBook.title}</h2>
                  <div className="book-detail-author">著者：{selectedBook.author}</div>
                  
                  <div className="book-detail-badge-group">
                    <span className="badge badge-rating">
                      豆瓣 ⭐ {selectedBook.rating}
                    </span>
                    <span className="badge badge-location">
                      位置：第 {selectedBook.row} 排, {selectedBook.position} 号位
                    </span>
                    <span 
                      className="badge"
                      style={{
                        backgroundColor: selectedBook.isDigitized ? 'var(--success-light)' : 'rgba(0,0,0,0.05)',
                        color: selectedBook.isDigitized ? 'var(--success)' : 'var(--text-muted)'
                      }}
                    >
                      {selectedBook.isDigitized ? '已确认归档' : '未核准归档'}
                    </span>
                  </div>

                  <p className="book-detail-desc">{selectedBook.description || '暂无内容介绍'}</p>

                  <div className="book-detail-links">
                    <h4 style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '0.25rem' }}>外部关联检索 (跳转外部平台)：</h4>
                    <a 
                      href={selectedBook.doubanLink} 
                      target="_blank" 
                      rel="noreferrer" 
                      className="book-detail-link-btn"
                    >
                      <span>📖 豆瓣读书档案</span>
                      <ExternalLink size={14} />
                    </a>
                    <a 
                      href={selectedBook.wereadLink} 
                      target="_blank" 
                      rel="noreferrer" 
                      className="book-detail-link-btn"
                    >
                      <span>🔍 微信读书电子版</span>
                      <ExternalLink size={14} />
                    </a>
                    <a 
                      href={selectedBook.taobaoLink} 
                      target="_blank" 
                      rel="noreferrer" 
                      className="book-detail-link-btn"
                    >
                      <span>🛍️ 淘宝比价购买</span>
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-secondary"
                onClick={() => setEditingBook(selectedBook)}
              >
                修改信息
              </button>
              <button 
                className="btn btn-danger"
                onClick={() => handleDeleteBook(selectedBook.id!)}
              >
                删除书籍
              </button>
              <button 
                className="btn btn-primary"
                onClick={() => toggleBookDigitized(selectedBook)}
              >
                {selectedBook.isDigitized ? '标记为未归档' : '标记为已数字化'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: EDIT BOOK DETAILS --- */}
      {editingBook && (
        <div className="modal-overlay" onClick={() => setEditingBook(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleUpdateBookDetails}>
              <div className="modal-header">
                <h3>编辑书籍信息</h3>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ padding: '0.25rem 0.5rem', border: 'none' }}
                  onClick={() => setEditingBook(null)}
                >
                  ✕
                </button>
              </div>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="form-group">
                  <label>书名：</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={editingBook.title}
                    onChange={(e) => setEditingBook(prev => prev ? { ...prev, title: e.target.value } : null)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>作者：</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={editingBook.author}
                    onChange={(e) => setEditingBook(prev => prev ? { ...prev, author: e.target.value } : null)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>估计评分：</label>
                  <input 
                    type="number" 
                    step="0.1" 
                    min="0" 
                    max="10" 
                    className="form-input" 
                    value={editingBook.rating}
                    onChange={(e) => setEditingBook(prev => prev ? { ...prev, rating: Number(e.target.value) } : null)}
                  />
                </div>
                <div className="form-group">
                  <label>封面脊梁色值 (Cover Hex)：</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input 
                      type="color" 
                      value={editingBook.coverColor}
                      onChange={(e) => setEditingBook(prev => prev ? { ...prev, coverColor: e.target.value } : null)}
                      style={{ width: '40px', height: '40px', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
                    />
                    <input 
                      type="text" 
                      className="form-input" 
                      style={{ flexGrow: 1 }}
                      value={editingBook.coverColor}
                      onChange={(e) => setEditingBook(prev => prev ? { ...prev, coverColor: e.target.value } : null)}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>所属书架排数：</label>
                    <input 
                      type="number" 
                      min="1" 
                      className="form-input" 
                      value={editingBook.row}
                      onChange={(e) => setEditingBook(prev => prev ? { ...prev, row: Number(e.target.value) } : null)}
                    />
                  </div>
                  <div className="form-group">
                    <label>从左到右位置号：</label>
                    <input 
                      type="number" 
                      min="1" 
                      className="form-input" 
                      value={editingBook.position}
                      onChange={(e) => setEditingBook(prev => prev ? { ...prev, position: Number(e.target.value) } : null)}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>内容简介：</label>
                  <textarea 
                    className="form-input form-textarea" 
                    value={editingBook.description}
                    onChange={(e) => setEditingBook(prev => prev ? { ...prev, description: e.target.value } : null)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => setEditingBook(null)}
                >
                  取消
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                >
                  保存修改
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
