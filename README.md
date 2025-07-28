

# 🤖 YupVendas - Bot de Vendas para WhatsApp com Painel de Controle

YupVendas é uma solução completa de automação de vendas para WhatsApp, projetada para pequenas e médias empresas. O sistema combina um chatbot inteligente para interagir com clientes e um painel de controle administrativo baseado na web para gerenciamento de produtos, clientes, pedidos e muito mais.

## ✨ Funcionalidades Principais

O projeto é dividido em duas interfaces principais: o **Fluxo do Cliente (via WhatsApp)** e o **Painel Administrativo (via Web e WhatsApp)**.

### 🛍️ Para o Cliente (WhatsApp)

  - **Navegação Intuitiva:** Menus baseados em listas para uma experiência de usuário simples e direta.
  - **Catálogo de Produtos:** Visualização de produtos disponíveis com descrições, preços e conteúdo (unidades ou peso).
  - **Carrinho de Compras Persistente:** Os itens adicionados ao carrinho são salvos, permitindo que o cliente continue a compra de onde parou.
  - **Finalização de Pedido:** O bot verifica se o pedido atinge o valor mínimo antes de confirmar.
  - **Confirmação Instantânea:** O cliente recebe uma mensagem de confirmação assim que o pedido é finalizado.
  - **Histórico de Pedidos:** Clientes podem visualizar seus últimos 5 pedidos diretamente no WhatsApp.
  - **Pedido Padrão:** Opção de salvar um pedido como "padrão" para facilitar compras futuras.
  - **Lista de Espera:** Clientes podem solicitar serem notificados quando um produto sem estoque voltar a ficar disponível.

### ⚙️ Para o Administrador (Web e WhatsApp)

  - **Notificações de Novos Pedidos:** Receba um alerta detalhado no WhatsApp a cada novo pedido realizado.
  - **Gerenciamento de Produtos:** Adicione, edite, remova e gerencie o estoque de produtos pelo WhatsApp.
  - **Gerenciamento de Clientes:**
      - Cadastre novos clientes pelo WhatsApp.
      - **Consulta de CNPJ:** O sistema utiliza a API BrasilAPI para preencher automaticamente os dados do cliente ao fornecer um CNPJ, agilizando o cadastro.
      - Cadastro manual como alternativa.
  - **Relatórios de Desempenho:** Gere relatórios de "Top 5 Produtos Mais Vendidos" e "Top 5 Clientes" diretamente no WhatsApp.
  - **Configurações Flexíveis:** Defina o valor mínimo para pedidos através de um comando no WhatsApp.

### 💻 Painel de Controle (Web)

  - **Dashboard de Métricas:** Visualize estatísticas chave como faturamento total, número de pedidos, e contagem de produtos e clientes.
  - **Chat em Tempo Real:** Converse com clientes diretamente pelo painel (Modo Humano), pausando o bot para aquele cliente específico.
  - **Gestão Completa:** Gerencie clientes, produtos e visualize o histórico de pedidos com detalhes.
  - **Campanhas de Marketing:** Envie mensagens em massa para uma lista selecionada de clientes, com suporte para personalização (ex: `{nome}`).
  - **Customização de Mensagens:** Edite todas as mensagens que o bot envia através de uma interface no painel, sem precisar alterar o código.
  - **Sistema de Autenticação:** Painel protegido por login e senha, com sistema de tokens (JWT) para segurança.

## 🛠️ Tecnologias Utilizadas

Este projeto foi construído utilizando tecnologias modernas de JavaScript:

  - **Backend:** Node.js, Express.js
  - **Integração com WhatsApp:** `@wppconnect-team/wppconnect`
  - **Banco de Dados:** SQLite3
  - **Comunicação em Tempo Real:** Socket.io (para o painel web)
  - **Autenticação:** JSON Web Tokens (JWT) e `bcrypt` para hash de senhas
  - **API Externa:** `axios` para consultar a BrasilAPI (CNPJ)
  - **Frontend (Painel):** HTML, CSS, JavaScript (arquivos estáticos na pasta `public`)

## 🚀 Começando

Para rodar este projeto localmente, você precisará ter o Node.js instalado. Siga os passos abaixo.

### Pré-requisitos

  - Node.js (versão 16 ou superior)
  - npm (geralmente vem com o Node.js)

### Instalação e Execução

1.  **Clone o repositório:**

    ```bash
    git clone https://github.com/seu-usuario/seu-repositorio.git
    cd seu-repositorio
    ```

2.  **Instale as dependências:**
    (Nota: Um `package.json` não foi fornecido, mas estas são as dependências principais com base nos arquivos.)

    ```bash
    npm install express sqlite3 @wppconnect-team/wppconnect bcrypt cors jsonwebtoken socket.io axios
    ```

3.  **Configure o Administrador:**
    No arquivo `database.js`, você pode alterar o número de telefone padrão do administrador na função `initializeDatabase`:

    ```javascript
    // Em database.js
    await dbRun("INSERT OR IGNORE INTO config (key, value) VALUES ('adminPhone', '5511999999999')");
    ```

    Altere `'5511999999999'` para o seu número no formato DDI+DDD+Número.

4.  **Inicie o servidor:**

    ```bash
    node index.js
    ```

5.  **Conecte o WhatsApp:**
    Abra o terminal onde o servidor está rodando. Um QR Code será exibido. Use o aplicativo do WhatsApp no seu celular para escaneá-lo e conectar a sua conta.

6.  **Acesse o Painel Web:**
    Após iniciar o servidor, acesse `http://localhost:3000/login.html` em seu navegador.

      - **Usuário padrão:** `admin`
      - **Senha padrão:** `admin`

## 📂 Estrutura do Projeto

```
.
├── data/
│   └── database.db       # Arquivo do banco de dados SQLite
├── public/               # Contém os arquivos do painel web (HTML, CSS, JS)
├── index.js              # Ponto de entrada principal, lógica do bot WPPConnect
├── server.js             # Lógica do servidor web Express e API REST
├── database.js           # Configuração e inicialização do banco de dados SQLite
└── messages.js           # Mensagens padrão para popular o banco de dados
```

-----
