import Dexie, { type Table } from 'dexie';

export interface Shelf {
  id?: number;
  name: string;
  description: string;
  photoUrl?: string;
  createdAt: number;
}

export interface Book {
  id?: number;
  shelfId: number;
  row: number; // 1-indexed row number
  position: number; // 1-indexed position from left to right
  title: string;
  author: string;
  description: string;
  coverColor: string; // Hex color code (e.g., #3A6D8C)
  rating: number; // Douban rating (e.g., 8.5)
  doubanLink: string;
  wereadLink: string;
  taobaoLink: string;
  isDigitized: boolean; // Whether the user has confirmed/archived it
  createdAt: number;
}

export interface AppSetting {
  key: string;
  value: string;
}

export class BookshelfDatabase extends Dexie {
  shelves!: Table<Shelf>;
  books!: Table<Book>;
  settings!: Table<AppSetting>;

  constructor() {
    super('BookshelfDatabase');
    this.version(1).stores({
      shelves: '++id, name, createdAt',
      books: '++id, shelfId, row, position, title, author, rating, isDigitized',
      settings: 'key',
    });
  }
}

export const db = new BookshelfDatabase();

let isSeeding = false;

// Seed data function to populate a mock shelf for Demo Mode
export async function seedDemoData() {
  if (isSeeding) return;
  isSeeding = true;

  try {
    const shelfCount = await db.shelves.count();
    if (shelfCount > 0) return; // Database already seeded

    // Add a demo shelf
    const shelfId = await db.shelves.add({
    name: '客厅木质书架',
    description: '位于客厅电视墙左侧，存放常用人文社科与小说书籍。',
    photoUrl: '/demo_bookshelf.jpg',
    createdAt: Date.now(),
  });

  const demoBooks: Omit<Book, 'id'>[] = [
    // Row 1
    {
      shelfId: shelfId as number,
      row: 1,
      position: 1,
      title: '三体',
      author: '刘慈欣',
      description: '文化大革命期间，红岸基地的一项秘密计划使人类首次与外星文明建立了联系。',
      coverColor: '#0c2310', // Dark green
      rating: 8.9,
      doubanLink: 'https://search.douban.com/book/subject_search?search_text=三体',
      wereadLink: 'https://weread.qq.com/web/search/query?keywords=三体',
      taobaoLink: 'https://s.taobao.com/search?q=三体',
      isDigitized: true,
      createdAt: Date.now(),
    },
    {
      shelfId: shelfId as number,
      row: 1,
      position: 2,
      title: '人类简史',
      author: '尤瓦尔·赫拉利',
      description: '十万年前，地球上至少有六个人种，为什么今天只剩下了我们？一部宏大的人类历史。',
      coverColor: '#d2b48c', // Tan/Sand
      rating: 9.1,
      doubanLink: 'https://search.douban.com/book/subject_search?search_text=人类简史',
      wereadLink: 'https://weread.qq.com/web/search/query?keywords=人类简史',
      taobaoLink: 'https://s.taobao.com/search?q=人类简史',
      isDigitized: true,
      createdAt: Date.now(),
    },
    {
      shelfId: shelfId as number,
      row: 1,
      position: 3,
      title: '黑客与画家',
      author: 'Paul Graham',
      description: '本书是硅谷创业教父 Paul Graham 的文集，探讨了程序员的思维方式与创业逻辑。',
      coverColor: '#ffffff', // White
      rating: 8.7,
      doubanLink: 'https://search.douban.com/book/subject_search?search_text=黑客与画家',
      wereadLink: 'https://weread.qq.com/web/search/query?keywords=黑客与画家',
      taobaoLink: 'https://s.taobao.com/search?q=黑客与画家',
      isDigitized: true,
      createdAt: Date.now(),
    },
    // Row 2
    {
      shelfId: shelfId as number,
      row: 2,
      position: 1,
      title: '设计心理学',
      author: '唐纳德·诺曼',
      description: '经典的设计入门书，探讨了为什么有些产品好用，有些让人抓狂。',
      coverColor: '#e63946', // Vibrant Red
      rating: 8.2,
      doubanLink: 'https://search.douban.com/book/subject_search?search_text=设计心理学',
      wereadLink: 'https://weread.qq.com/web/search/query?keywords=设计心理学',
      taobaoLink: 'https://s.taobao.com/search?q=设计心理学',
      isDigitized: true,
      createdAt: Date.now(),
    },
    {
      shelfId: shelfId as number,
      row: 2,
      position: 2,
      title: '心理学与生活',
      author: '理查德·格里格',
      description: '心理学基础教科书的典范，兼具科学性与通俗性，帮助我们更好理解人类自身。',
      coverColor: '#1d3557', // Deep blue
      rating: 9.4,
      doubanLink: 'https://search.douban.com/book/subject_search?search_text=心理学与生活',
      wereadLink: 'https://weread.qq.com/web/search/query?keywords=心理学与生活',
      taobaoLink: 'https://s.taobao.com/search?q=心理学与生活',
      isDigitized: true,
      createdAt: Date.now(),
    },
    {
      shelfId: shelfId as number,
      row: 2,
      position: 3,
      title: '金字塔原理',
      author: '芭芭拉·明托',
      description: '关于思考、表达和解决问题逻辑的圣经，指导人们如何更清晰、条理地传达信息。',
      coverColor: '#f1faee', // Off white/Light green
      rating: 8.1,
      doubanLink: 'https://search.douban.com/book/subject_search?search_text=金字塔原理',
      wereadLink: 'https://weread.qq.com/web/search/query?keywords=金字塔原理',
      taobaoLink: 'https://s.taobao.com/search?q=金字塔原理',
      isDigitized: true,
      createdAt: Date.now(),
    }
  ];

    await db.books.bulkAdd(demoBooks as Book[]);
  } finally {
    isSeeding = false;
  }
}
