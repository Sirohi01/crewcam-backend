import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
export const extractTextFromBuffer = async (buffer: Buffer, mimeType: string): Promise<string> => {
  if (mimeType.includes('wordprocessingml') || mimeType === 'application/msword') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  }
  if (mimeType === 'application/pdf') {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text.trim();
    } finally {
      await parser.destroy();
    }
  }
  return '';
};
