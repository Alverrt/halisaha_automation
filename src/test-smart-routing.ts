import { config } from './config';
import { GeminiProvider } from './providers/gemini.provider';
import { ToolRouter } from './toolRouter';
import { ToolDefinition } from './providers/types';

// Sample tools
const tools: ToolDefinition[] = [
  {
    name: 'create_reservation',
    description: 'Yeni bir rezervasyon oluşturur',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'show_week_table',
    description: 'Haftalık rezervasyon tablosunu görsel olarak gösterir',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'list_week_reservations',
    description: 'Haftalık rezervasyonları liste halinde gösterir',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'get_sales_analytics',
    description: 'Bu hafta veya bu ay kaç saat satıldığını, gelir bilgilerini gösterir',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'get_loyal_customers',
    description: 'En sadık müşterileri listeler',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'cancel_reservation',
    description: 'Rezervasyonu iptal eder',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'find_reservations_by_name',
    description: 'Müşteri adına göre aktif rezervasyonları bulur',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'get_current_time',
    description: 'İstanbul saat diliminde şu anki tarihi ve saati döndürür',
    parameters: { type: 'object', properties: {}, required: [] }
  }
];

async function testSmartRouting() {
  console.log('🧪 Testing Smart Tool Routing\n');

  const llmProvider = new GeminiProvider(
    config.llm.gemini.project,
    config.llm.gemini.location,
    config.llm.gemini.model
  );

  const router = new ToolRouter(llmProvider, tools);

  const testQueries = [
    'Ahmet için yarın saat 9-10 rezervasyon yap',
    'Bu haftaki rezervasyonları göster',
    'Bu ayki gelir ne kadar?',
    'Ali adına rezervasyon var mı?',
    'Bugün hangi gün?'
  ];

  for (const query of testQueries) {
    console.log(`\n📝 Query: "${query}"`);
    console.log(`⏳ Routing...`);

    const selectedTools = await router.selectRelevantTools(query, 3);

    console.log(`✅ Selected ${selectedTools.length} tools:`);
    selectedTools.forEach((tool, i) => {
      console.log(`   ${i + 1}. ${tool.name}`);
    });
    console.log(`💡 Saved ${tools.length - selectedTools.length} tools from being sent!`);
  }

  console.log('\n✅ Smart routing test complete!');
}

testSmartRouting().catch(console.error);
