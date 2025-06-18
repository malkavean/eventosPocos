export default {
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: {
                main: 'index.html',
                admin: 'admin.html',
                login: 'login.html',
                contact: 'contact.html',     // ← ADICIONE ESTA LINHA
                privacy: 'privacy.html',     // ← E ESTA
                terms: 'terms.html',
            }
        }
    }
}