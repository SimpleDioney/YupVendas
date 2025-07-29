// testMercadoPago.js

// Importa a SDK do Mercado Pago
const { MercadoPagoConfig, Payment } = require('mercadopago');

// --- IMPORTANTE: COLE SEU TOKEN DE TESTE AQUI ---
// Certifique-se de que ele esteja entre as aspas e comece com "TEST-"
const TEST_ACCESS_TOKEN = "TEST-4148827707526394-072908-3fc7d0054406ad1558f1b24e7e6e7c09-1088636775";

// Função principal para executar o teste
async function main() {
    if (!TEST_ACCESS_TOKEN || TEST_ACCESS_TOKEN === "COLE_SEU_TOKEN_DE_TESTE_AQUI") {
        console.error("❌ ERRO: Por favor, edite o arquivo 'testMercadoPago.js' e cole seu Access Token de Teste na variável TEST_ACCESS_TOKEN.");
        return;
    }

    console.log("▶️  Iniciando teste de criação de pagamento com o Mercado Pago...");
    console.log(`▶️  Usando token que começa com: ${TEST_ACCESS_TOKEN.substring(0, 15)}...`);

    try {
        // 1. Inicializa o cliente de configuração com o token
        const client = new MercadoPagoConfig({ accessToken: TEST_ACCESS_TOKEN });

        // 2. Cria uma instância do serviço de Pagamento
        const payment = new Payment(client);

        // 3. Cria um corpo de requisição de pagamento de teste
        const paymentData = {
            transaction_amount: 1,
            description: 'Teste de Integração YupVendas',
            payment_method_id: 'pix',
            payer: {
                email: 'test_user@test.com',
            },
        };

        // 4. Envia a requisição para criar o pagamento
        const result = await payment.create({ body: paymentData });

        console.log("\n✅ SUCESSO! Conexão com Mercado Pago bem-sucedida!");
        console.log("   - ID do Pagamento de Teste:", result.id);
        console.log("   - Status:", result.status);

    } catch (error) {
        console.error("\n❌ FALHA! A API do Mercado Pago retornou um erro.");
        console.error("   - Causa do Erro:", error.cause);
        
        // Imprime a resposta completa da API, se disponível
        if (error.cause) {
            console.error("\n--- Detalhes Completos do Erro da API ---");
            console.error(JSON.stringify(error.cause, null, 2));
            console.error("-----------------------------------------");
        }
    }
}

// Executa a função
main();