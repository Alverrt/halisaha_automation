import axios from 'axios';
import FormData from 'form-data';
import { config } from './config';

export class WhatsAppClient {
  private readonly baseUrl = 'https://graph.facebook.com/v18.0';
  private readonly phoneNumberId: string;
  private readonly accessToken: string;

  constructor() {
    this.phoneNumberId = config.whatsapp.phoneNumberId;
    this.accessToken = config.whatsapp.accessToken;
  }

  async sendMessage(to: string, message: string): Promise<void> {
    try {
      const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;

      await axios.post(
        url,
        {
          messaging_product: 'whatsapp',
          to: to,
          type: 'text',
          text: {
            body: message,
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log(`Message sent to ${to}`);
    } catch (error) {
      console.error('Error sending WhatsApp message:', error);
      throw error;
    }
  }

  async sendImage(to: string, imageBuffer: Buffer): Promise<void> {
    try {
      // First, upload the image to WhatsApp
      const uploadUrl = `${this.baseUrl}/${this.phoneNumberId}/media`;

      const formData = new FormData();
      formData.append('messaging_product', 'whatsapp');
      formData.append('file', imageBuffer, {
        filename: 'table.png',
        contentType: 'image/png',
      });

      const uploadResponse = await axios.post(uploadUrl, formData, {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${this.accessToken}`,
        },
      });

      const mediaId = uploadResponse.data.id;

      // Then send the image message
      const messageUrl = `${this.baseUrl}/${this.phoneNumberId}/messages`;

      await axios.post(
        messageUrl,
        {
          messaging_product: 'whatsapp',
          to: to,
          type: 'image',
          image: {
            id: mediaId,
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log(`Image sent to ${to}`);
    } catch (error) {
      console.error('Error sending WhatsApp image:', error);
      throw error;
    }
  }

  async markAsRead(messageId: string): Promise<void> {
    try {
      const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;

      await axios.post(
        url,
        {
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  }
}
