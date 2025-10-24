import { createCanvas } from 'canvas';
import { ReservationDetails } from './reservationService';

interface TimeSlot {
  hour: number;
  day: number;
  reservation?: ReservationDetails;
}

class TableVisualizationService {
  private readonly CELL_WIDTH = 120;
  private readonly CELL_HEIGHT = 50;
  private readonly HEADER_HEIGHT = 60;
  private readonly TIME_COLUMN_WIDTH = 100;
  private readonly DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  private readonly HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 6:00 to 22:00

  async generateWeekTable(
    reservations: ReservationDetails[],
    weekStartDate: Date
  ): Promise<Buffer> {
    const width = this.TIME_COLUMN_WIDTH + this.CELL_WIDTH * 7;
    const height = this.HEADER_HEIGHT + this.CELL_HEIGHT * this.HOURS.length;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Draw header
    this.drawHeader(ctx, weekStartDate);

    // Draw time column and grid
    this.drawTimeColumn(ctx);
    this.drawGrid(ctx);

    // Fill reservations
    this.fillReservations(ctx, reservations, weekStartDate);

    return canvas.toBuffer('image/png');
  }

  private drawHeader(ctx: any, weekStartDate: Date): void {
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(0, 0, this.TIME_COLUMN_WIDTH + this.CELL_WIDTH * 7, this.HEADER_HEIGHT);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Time column header
    ctx.fillText('Saat', this.TIME_COLUMN_WIDTH / 2, this.HEADER_HEIGHT / 2);

    // Day headers
    this.DAYS.forEach((day, index) => {
      const date = new Date(weekStartDate);
      date.setDate(weekStartDate.getDate() + index);
      const dayNum = date.getDate();
      const month = date.getMonth() + 1;

      const x = this.TIME_COLUMN_WIDTH + this.CELL_WIDTH * index + this.CELL_WIDTH / 2;
      ctx.fillText(day, x, this.HEADER_HEIGHT / 2 - 10);

      ctx.font = '12px Arial';
      ctx.fillText(`${dayNum}/${month}`, x, this.HEADER_HEIGHT / 2 + 10);
      ctx.font = 'bold 16px Arial';
    });
  }

  private drawTimeColumn(ctx: any): void {
    ctx.fillStyle = '#34495e';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    this.HOURS.forEach((hour, index) => {
      const y = this.HEADER_HEIGHT + this.CELL_HEIGHT * index;

      // Background
      ctx.fillStyle = '#ecf0f1';
      ctx.fillRect(0, y, this.TIME_COLUMN_WIDTH, this.CELL_HEIGHT);

      // Border
      ctx.strokeStyle = '#bdc3c7';
      ctx.strokeRect(0, y, this.TIME_COLUMN_WIDTH, this.CELL_HEIGHT);

      // Time text
      ctx.fillStyle = '#2c3e50';
      const timeText = `${hour}:00`;
      ctx.fillText(
        timeText,
        this.TIME_COLUMN_WIDTH / 2,
        y + this.CELL_HEIGHT / 2
      );
    });
  }

  private drawGrid(ctx: any): void {
    ctx.strokeStyle = '#bdc3c7';
    ctx.lineWidth = 1;

    // Draw cells
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < this.HOURS.length; hour++) {
        const x = this.TIME_COLUMN_WIDTH + this.CELL_WIDTH * day;
        const y = this.HEADER_HEIGHT + this.CELL_HEIGHT * hour;

        // Empty cell background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, this.CELL_WIDTH, this.CELL_HEIGHT);

        // Border
        ctx.strokeRect(x, y, this.CELL_WIDTH, this.CELL_HEIGHT);
      }
    }
  }

  private fillReservations(
    ctx: any,
    reservations: ReservationDetails[],
    weekStartDate: Date
  ): void {
    reservations.forEach((reservation) => {
      const startTime = new Date(reservation.start_time);
      const endTime = new Date(reservation.end_time);

      // Calculate day offset from week start
      const dayDiff = Math.floor(
        (startTime.getTime() - weekStartDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (dayDiff < 0 || dayDiff >= 7) return;

      const startHour = startTime.getHours();
      const endHour = endTime.getHours();

      // Find hour index
      const startIndex = this.HOURS.indexOf(startHour);
      if (startIndex === -1) return;

      const hourSpan = endHour - startHour;

      // Draw reservation cell
      const x = this.TIME_COLUMN_WIDTH + this.CELL_WIDTH * dayDiff;
      const y = this.HEADER_HEIGHT + this.CELL_HEIGHT * startIndex;
      const cellHeight = this.CELL_HEIGHT * hourSpan;

      // Reservation background
      ctx.fillStyle = '#27ae60';
      ctx.fillRect(x + 2, y + 2, this.CELL_WIDTH - 4, cellHeight - 4);

      // Customer name
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      const centerX = x + this.CELL_WIDTH / 2;
      const centerY = y + 10;

      // Wrap text if too long
      const maxWidth = this.CELL_WIDTH - 10;
      const name = reservation.customer_name;

      if (ctx.measureText(name).width > maxWidth) {
        const words = name.split(' ');
        if (words.length > 1) {
          ctx.fillText(words[0], centerX, centerY);
          ctx.font = '12px Arial';
          ctx.fillText(words.slice(1).join(' '), centerX, centerY + 16);
        } else {
          ctx.font = '12px Arial';
          ctx.fillText(name.substring(0, 15) + '...', centerX, centerY);
        }
      } else {
        ctx.fillText(name, centerX, centerY);
      }

      // Phone number
      ctx.font = '11px Arial';
      ctx.fillText(
        reservation.phone_number,
        centerX,
        centerY + (name.length > 15 ? 28 : 20)
      );
    });
  }

  async generateWeekTableWithTitle(
    reservations: ReservationDetails[],
    weekStartDate: Date,
    weekOffset: number
  ): Promise<Buffer> {
    const tableBuffer = await this.generateWeekTable(reservations, weekStartDate);

    // Add title above the table
    const titleHeight = 50;
    const tableCanvas = await this.bufferToCanvas(tableBuffer);

    const width = tableCanvas.width;
    const height = tableCanvas.height + titleHeight;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Title
    ctx.fillStyle = '#2c3e50';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekStartDate.getDate() + 6);

    const title = weekOffset === 0
      ? 'Bu Hafta Rezervasyon Tablosu'
      : weekOffset < 0
      ? `${Math.abs(weekOffset)} Hafta Önce Rezervasyon Tablosu`
      : `${weekOffset} Hafta Sonra Rezervasyon Tablosu`;

    ctx.fillText(title, width / 2, titleHeight / 2);

    // Draw table
    ctx.drawImage(tableCanvas, 0, titleHeight);

    return canvas.toBuffer('image/png');
  }

  private async bufferToCanvas(buffer: Buffer): Promise<any> {
    const { createCanvas, loadImage } = await import('canvas');
    const img = await loadImage(buffer);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return canvas;
  }
}

export const tableVisualizationService = new TableVisualizationService();
