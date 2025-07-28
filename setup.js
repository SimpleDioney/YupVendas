const readline = require('readline');
const { db, dbRun } = require('./database.js');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askQuestion = (query) => new Promise(resolve => rl.question(query, resolve));

const runSetup = async () => {
    console.log('--- Configuração Inicial do Bot de Vendas ---');
    const adminPhoneRaw = await askQuestion('Qual é o número de WhatsApp do Administrador? (ex: 5543999998888)\n> ');
    const adminPhone = adminPhoneRaw.replace(/\D/g, '');
    if (!adminPhone || adminPhone.length < 11) { console.error('Número inválido.'); rl.close(); return; }
    try {
        await dbRun(`UPDATE config SET value = ? WHERE key = 'adminPhone'`, [adminPhone]);
        console.log(`✅ Administrador definido como: ${adminPhone}`);
    } catch (err) { console.error('Erro ao salvar o admin:', err.message); rl.close(); db.close(); return; }
    
    const addAdminAsCustomer = await askQuestion('\nDeseja cadastrar este admin como cliente para testes? (s/n)\n> ');
    if (addAdminAsCustomer.toLowerCase() === 's') {
        const adminId = adminPhone + '@c.us';
        try {
            await dbRun(`INSERT INTO customers (phone, cnpj, address, city, state) VALUES (?, ?, ?, ?, ?)`, 
                [adminId, 'N/A', 'Endereço Admin', 'Cidade Admin', 'PR']);
            console.log('✅ Administrador adicionado como cliente para testes.');
        } catch (err) {
            if (err.code === 'SQLITE_CONSTRAINT') { console.log('ℹ️ O admin já estava cadastrado como cliente.'); }
        }
    }
    
    const addSampleProduct = await askQuestion('\nDeseja cadastrar um produto de exemplo? (s/n)\n> ');
    if (addSampleProduct.toLowerCase() === 's') {
        // ***** ATUALIZADO PARA O NOVO FORMATO *****
        const name = 'Croissant de Chocolate (Exemplo)';
        const price = 14.99; // Preço do pacote
        const stock = 50; // 50 pacotes
        const contentType = 'unidade'; // Conteúdo medido em unidades
        const contentValue = 2; // 2 unidades por pacote
        try {
            await dbRun(`INSERT INTO products (name, price, stock, contentType, contentValue) VALUES (?, ?, ?, ?, ?)`,
                [name, price, stock, contentType, contentValue]);
            console.log(`✅ Produto de exemplo "${name}" cadastrado!`);
        } catch (err) { console.error('Erro ao cadastrar produto de exemplo:', err.message); }
    }
    
    console.log('\n--- Configuração Concluída! ---');
    console.log('Pode iniciar o bot com: node index.js');
    rl.close();
};

runSetup().finally(() => {
    db.close((err) => {
        if (err) { console.error(err.message); }
        console.log('Conexão com o banco de dados fechada.');
    });
});