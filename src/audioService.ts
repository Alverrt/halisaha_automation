import axios from 'axios';
import OpenAI from 'openai';
import { config } from './config';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const mkdir = promisify(fs.mkdir);

export class AudioService {
  private openai: OpenAI;
  private readonly tempDir = '/tmp/whatsapp_audio';

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
    });
    this.ensureTempDir();
  }

  private async ensureTempDir(): Promise<void> {
    try {
      await mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Error creating temp directory:', error);
    }
  }

  async downloadWhatsAppAudio(mediaId: string): Promise<string> {
    try {
      // Step 1: Get media URL from WhatsApp
      const mediaUrlResponse = await axios.get(
        `https://graph.facebook.com/v18.0/${mediaId}`,
        {
          headers: {
            Authorization: `Bearer ${config.whatsapp.accessToken}`,
          },
        }
      );

      const mediaUrl = mediaUrlResponse.data.url;

      // Step 2: Download the audio file
      const audioResponse = await axios.get(mediaUrl, {
        headers: {
          Authorization: `Bearer ${config.whatsapp.accessToken}`,
        },
        responseType: 'arraybuffer',
      });

      // Step 3: Save to temp file
      const tempFilePath = path.join(this.tempDir, `${mediaId}.ogg`);
      await writeFile(tempFilePath, audioResponse.data);

      console.log(`Audio downloaded: ${tempFilePath}`);
      return tempFilePath;
    } catch (error) {
      console.error('Error downloading WhatsApp audio:', error);
      throw error;
    }
  }

  async transcribeAudio(audioFilePath: string): Promise<string> {
    try {
      console.log(`Transcribing audio: ${audioFilePath}`);

      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(audioFilePath),
        model: 'whisper-1',
        language: 'tr', // Turkish
      });

      console.log(`Transcription: ${transcription.text}`);
      return transcription.text;
    } catch (error) {
      console.error('Error transcribing audio:', error);
      throw error;
    }
  }

  async cleanupTempFile(filePath: string): Promise<void> {
    try {
      await unlink(filePath);
      console.log(`Temp file deleted: ${filePath}`);
    } catch (error) {
      console.error('Error deleting temp file:', error);
    }
  }

  async processVoiceMessage(mediaId: string): Promise<string> {
    let tempFilePath: string | null = null;

    try {
      // Download audio
      tempFilePath = await this.downloadWhatsAppAudio(mediaId);

      // Transcribe audio
      const transcription = await this.transcribeAudio(tempFilePath);

      return transcription;
    } finally {
      // Cleanup temp file
      if (tempFilePath) {
        await this.cleanupTempFile(tempFilePath);
      }
    }
  }
}
