document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('error-message');

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Erro ao tentar fazer login.');
        }

        localStorage.setItem('authToken', data.token);
        window.location.href = '/index.html'; // Redireciona para o painel

    } catch (error) {
        errorMessage.textContent = error.message;
    }
});