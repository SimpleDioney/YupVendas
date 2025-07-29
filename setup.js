// updateMinOrder.js

const sqlite3 = require('sqlite3').verbose();
const readline = require('readline');

// Conecta ao mesmo banco de dados que o seu bot utiliza
const db = new sqlite3.Database('./data/database.db', (err) => {
    if (err) {
        console.error('❌ Erro ao conectar ao banco de dados:', err.message);
        return;
    }
    console.log('✅ Conectado ao banco de dados SQLite.');
    askForNewValue();
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askForNewValue() {
    rl.question('➡️  Digite o novo valor do pedido mínimo (ex: 75.50): ', (newValue) => {
        const valueAsNumber = parseFloat(newValue.replace(',', '.'));

        if (isNaN(valueAsNumber) || valueAsNumber < 0) {
            console.error('\n❌ Valor inválido. Por favor, digite um número positivo.');
            rl.close();
            db.close();
            return;
        }

        updateDatabase(valueAsNumber.toFixed(2));
    });
}

function updateDatabase(value) {
    const sql = `UPDATE config SET value = ? WHERE key = 'minOrderValue'`;

    db.run(sql, [value], function(err) {
        if (err) {
            console.error('\n❌ Erro ao atualizar o valor no banco de dados:', err.message);
        } else if (this.changes === 0) {
            console.warn('\n⚠️  A chave "minOrderValue" não foi encontrada. Inserindo...');
            // Se a chave não existir, cria ela.
            const insertSql = `INSERT INTO config (key, value) VALUES ('minOrderValue', ?)`;
            db.run(insertSql, [value], (insertErr) => {
                if(insertErr) {
                     console.error('\n❌ Erro ao inserir a nova chave:', insertErr.message);
                } else {
                     console.log(`\n✅ Pedido mínimo inserido e definido como: R$ ${value}`);
                }
                rl.close();
                db.close();
            });
        } else {
            console.log(`\n✅ Pedido mínimo atualizado com sucesso para: R$ ${value}`);
            rl.close();
            db.close();
        }
    });
}