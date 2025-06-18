export default {
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: {
                main: 'index.html',
                admin: 'admin.html',
                login: 'login.html',
                contact: 'contact.html',
                privacy: 'privacy.html',
                terms: 'terms.html',
            }
        }
    }
}