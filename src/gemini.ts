export interface GeminiBookResult {
  title: string;
  author: string;
  description: string;
  coverColor: string; // HEX color code
  row: number; // Row index (1-indexed)
  position: number; // Order index from left to right (1-indexed)
  rating: number; // Estimated rating (0.0 to 10.0)
}

export interface GeminiScanResult {
  books: GeminiBookResult[];
}

// Convert a File/Blob to Generative Part (base64 object)
async function fileToGenerativePart(blob: Blob): Promise<{ inlineData: { data: string; mimeType: string } }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = (reader.result as string).split(',')[1];
      resolve({
        inlineData: {
          data: base64Data,
          mimeType: blob.type,
        },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Scan a bookshelf photo using the Gemini API or mock data in demo mode.
 */
export async function scanBookshelfPhoto(
  imageBlob: Blob | null,
  apiKey: string | null,
  useDemo: boolean
): Promise<GeminiScanResult> {
  if (useDemo || !apiKey || !imageBlob) {
    // Return mock data for Demo Mode
    await new Promise((resolve) => setTimeout(resolve, 3000)); // Simulate networking
    return {
      books: [
        {
          title: '瓦尔登湖',
          author: '亨利·戴维·梭罗',
          description: '梭罗独居瓦尔登湖畔的记录，关于极简生活与人与自然的和谐共处。',
          coverColor: '#2d6a4f', // Deep forest green
          row: 1,
          position: 1,
          rating: 8.8,
        },
        {
          title: '百年孤独',
          author: '加西亚·马尔克斯',
          description: '布恩迪亚家族七代人在马孔多小镇的兴衰荣辱，魔幻现实主义的巅峰之作。',
          coverColor: '#7209b7', // Purple
          row: 1,
          position: 2,
          rating: 9.3,
        },
        {
          title: '活着',
          author: '余华',
          description: '讲述了农村人福贵悲惨的一生，以坚忍不拔的生命态度直面无常的苦难。',
          coverColor: '#d62246', // Red
          row: 1,
          position: 3,
          rating: 9.4,
        },
        {
          title: '断舍离',
          author: '山下英子',
          description: '通过收拾物品来了解自己，整理内心的混沌，让人生变得清爽的实践指南。',
          coverColor: '#f4f1de', // Cream
          row: 2,
          position: 1,
          rating: 7.5,
        },
        {
          title: '非暴力沟通',
          author: '马歇尔·卢森堡',
          description: '指导人们如何转变谈话和聆听的方式，促进人与人之间的连结和理解。',
          coverColor: '#3a86c8', // Soft blue
          row: 2,
          position: 2,
          rating: 8.6,
        },
      ],
    };
  }

  try {
    const mediaPart = await fileToGenerativePart(imageBlob);

    const systemPrompt = `You are an expert bookshelf scanner AI. Analyze the image of the bookshelf.
Tasks:
1. Detect all books visible on the shelves.
2. Group the books by shelves/rows. For each row (numbered 1, 2, 3... from top to bottom), identify the books and list them in order from LEFT to RIGHT.
3. For each book, extract or predict:
   - "title": Book title in Chinese or its original language.
   - "author": Author's name.
   - "description": A concise 1-2 sentence Chinese summary of the book.
   - "coverColor": The dominant color of the book spine or cover, returned as a hex color code (e.g., "#E63946", "#1D3557").
   - "row": The 1-indexed row number.
   - "position": The 1-indexed order position on that row (left to right).
   - "rating": The estimated Douban rating of the book (0.0 to 10.0).

You must respond strictly in JSON format matching the schema:
{
  "books": [
    {
      "title": "Title",
      "author": "Author",
      "description": "Summary",
      "coverColor": "#hex",
      "row": number,
      "position": number,
      "rating": number
    }
  ]
}`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [
        {
          parts: [
            { text: systemPrompt },
            mediaPart
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errorText}`);
    }

    const json = await response.json();
    const responseText = json.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) {
      throw new Error('No content returned from Gemini API.');
    }

    const parsedResult: GeminiScanResult = JSON.parse(responseText);
    return parsedResult;
  } catch (error) {
    console.error('Failed to scan bookshelf photo with Gemini:', error);
    throw error;
  }
}
