import * as readline from 'readline';
import { FieldAgent } from './fieldAgent';
import { config } from './config';
import * as fs from 'fs';
import * as path from 'path';

// Mock WhatsApp client for CLI testing
class MockWhatsAppClient {
  private imageCounter = 0;
  private imageOutputDir: string;

  constructor() {
    // Create output directory for images
    this.imageOutputDir = path.join(process.cwd(), 'test-output');
    if (!fs.existsSync(this.imageOutputDir)) {
      fs.mkdirSync(this.imageOutputDir, { recursive: true });
    }
    console.log(`📁 Images will be saved to: ${this.imageOutputDir}\n`);
  }

  async sendMessage(to: string, message: string): Promise<void> {
    // Not needed for CLI testing
  }

  async sendImage(to: string, imageBuffer: Buffer): Promise<void> {
    this.imageCounter++;
    const filename = `table-${Date.now()}-${this.imageCounter}.png`;
    const filepath = path.join(this.imageOutputDir, filename);

    fs.writeFileSync(filepath, imageBuffer);
    console.log(`\n🖼️  Image saved: ${filepath}`);
    console.log(`   Open it to view the reservation table\n`);
  }
}

async function main() {
  console.clear();
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Halı Saha Bot - Local CLI Testing                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  console.log(`🤖 LLM Provider: ${config.llm.provider.toUpperCase()}`);
  console.log(`📦 Model: ${config.llm.provider === 'openai' ? config.llm.openai.model : config.llm.gemini.model}`);
  console.log(`\n💡 Type your messages as if you're chatting on WhatsApp`);
  console.log(`💡 Type 'exit' or 'quit' to end the session\n`);
  console.log('─'.repeat(60) + '\n');

  // Check if API keys are configured
  if (config.llm.provider === 'openai' && !config.llm.openai.apiKey) {
    console.error('❌ Error: OPENAI_API_KEY not configured in .env');
    process.exit(1);
  }

  if (config.llm.provider === 'gemini' && !config.llm.gemini.project) {
    console.error('❌ Error: GOOGLE_CLOUD_PROJECT not configured in .env');
    process.exit(1);
  }

  const mockWhatsAppClient = new MockWhatsAppClient();
  const fieldAgent = new FieldAgent(mockWhatsAppClient as any);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '👤 You: '
  });

  const testUserId = 'cli-test-user';

  rl.prompt();

  rl.on('line', async (line: string) => {
    const message = line.trim();

    if (!message) {
      rl.prompt();
      return;
    }

    if (message.toLowerCase() === 'exit' || message.toLowerCase() === 'quit') {
      console.log('\n👋 Goodbye!\n');
      rl.close();
      process.exit(0);
    }

    if (message.toLowerCase() === 'clear') {
      console.clear();
      rl.prompt();
      return;
    }

    try {
      // Disable prompt while processing
      rl.pause();

      console.log(''); // Empty line for spacing
      process.stdout.write('🤖 Bot: Thinking...\r');

      const response = await fieldAgent.processMessage(testUserId, message);

      // Clear the "Thinking..." line
      process.stdout.write('\r' + ' '.repeat(50) + '\r');

      console.log(`🤖 Bot: ${response}\n`);
    } catch (error: any) {
      console.error(`\n❌ Error: ${error.message}\n`);
    } finally {
      rl.resume();
      rl.prompt();
    }
  });

  rl.on('close', () => {
    console.log('\n👋 Session ended\n');
    process.exit(0);
  });

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    console.log('\n\n👋 Interrupted. Goodbye!\n');
    process.exit(0);
  });
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
