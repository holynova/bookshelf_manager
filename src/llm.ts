export interface LLMBookResult {
  title: string;
  author: string;
  description: string;
  coverColor: string; // HEX color code
  row: number; // Row index (1-indexed)
  position: number; // Order index from left to right (1-indexed)
  rating: number; // Estimated rating (0.0 to 10.0)
}

export interface LLMScanResult {
  books: LLMBookResult[];
}

// Convert a File/Blob to Base64 Data URL
async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Scan a bookshelf photo using an OpenAI-compatible API or mock data.
 */
export async function scanBookshelfPhoto(
  imageBlob: Blob | null,
  apiBaseUrl: string,
  apiKey: string | null,
  modelName: string,
  customPrompt: string,
  useDemo: boolean
): Promise<LLMScanResult> {
  if (useDemo || !imageBlob) {
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

  if (!apiKey) {
    throw new Error('API Key is required to perform a real scan.');
  }

  try {
    const dataUrl = await blobToDataUrl(imageBlob);

    // Clean up base URL: remove trailing slash
    const cleanedBaseUrl = apiBaseUrl.trim().replace(/\/+$/, '');
    const endpoint = `${cleanedBaseUrl}/chat/completions`;

    const requestBody = {
      model: modelName,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: customPrompt
            },
            {
              type: 'image_url',
              image_url: {
                url: dataUrl
              }
            }
          ]
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API error (${response.status}): ${errorText}`);
    }

    const json = await response.json();
    const responseText = json.choices?.[0]?.message?.content;

    if (!responseText) {
      throw new Error('No content returned from LLM API choices.');
    }

    const parsedResult: LLMScanResult = JSON.parse(responseText);
    
    if (!parsedResult.books || !Array.isArray(parsedResult.books)) {
      throw new Error('LLM output format is invalid: expected a "books" array.');
    }

    return parsedResult;
  } catch (error) {
    console.error('Failed to scan bookshelf photo with OpenAI-compatible LLM:', error);
    throw error;
  }
}
