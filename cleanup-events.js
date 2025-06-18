// cleanup-events.js - Script para limpeza automática de eventos expirados

// Configuração do Supabase
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'fallback-url';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'fallback-url';

class EventCleanupManager {
    constructor() {
        this.supabase = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        this.lastCleanup = localStorage.getItem('lastEventCleanup');
    }

    // Verificar se um evento deve ser marcado como inativo
    shouldRemoveEvent(evento) {
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

        // Se tem data_fim, usar ela como referência
        if (evento.data_fim) {
            const dataFim = new Date(evento.data_fim);
            return dataFim < oneDayAgo;
        }

        // Se não tem data_fim, usar data_inicio
        const dataInicio = new Date(evento.data_inicio);
        return dataInicio < oneDayAgo;
    }

    // Marcar eventos como inativos (soft delete)
    async markExpiredEventsAsInactive() {
        if (!this.supabase) {
            console.error('Supabase não inicializado');
            return { success: false, error: 'Supabase não disponível' };
        }

        try {
            console.log('🧹 Iniciando limpeza de eventos expirados...');

            // Buscar todos os eventos ativos
            const { data: eventos, error: fetchError } = await this.supabase
                .from('eventos')
                .select('*')
                .eq('ativo', true); // Só eventos ativos

            if (fetchError) {
                throw fetchError;
            }

            if (!eventos || eventos.length === 0) {
                console.log('✅ Nenhum evento ativo encontrado');
                return { success: true, removed: 0 };
            }

            // Filtrar eventos que devem ser removidos
            const eventosParaRemover = eventos.filter(evento => this.shouldRemoveEvent(evento));

            if (eventosParaRemover.length === 0) {
                console.log('✅ Nenhum evento expirado encontrado');
                return { success: true, removed: 0 };
            }

            console.log(`📋 Encontrados ${eventosParaRemover.length} eventos para marcar como inativos:`,
                eventosParaRemover.map(e => e.titulo));

            // Marcar eventos como inativos
            const idsParaRemover = eventosParaRemover.map(e => e.id);

            const { error: updateError } = await this.supabase
                .from('eventos')
                .update({
                    ativo: false,
                    data_remocao: new Date().toISOString()
                })
                .in('id', idsParaRemover);

            if (updateError) {
                throw updateError;
            }

            // Salvar log da limpeza
            await this.logCleanupAction(eventosParaRemover.length);

            console.log(`✅ ${eventosParaRemover.length} eventos marcados como inativos`);

            return {
                success: true,
                removed: eventosParaRemover.length,
                events: eventosParaRemover.map(e => ({
                    id: e.id,
                    titulo: e.titulo,
                    data_inicio: e.data_inicio,
                    data_fim: e.data_fim
                }))
            };

        } catch (error) {
            console.error('❌ Erro na limpeza de eventos:', error);
            return { success: false, error: error.message };
        }
    }

    // Salvar log da limpeza
    async logCleanupAction(quantidadeRemovidos) {
        try {
            await this.supabase
                .from('log_eventos_removidos')
                .insert([{
                    quantidade_removidos: quantidadeRemovidos,
                    data_execucao: new Date().toISOString()
                }]);

            // Atualizar localStorage
            localStorage.setItem('lastEventCleanup', new Date().toISOString());

        } catch (error) {
            console.warn('Aviso: Não foi possível salvar log da limpeza:', error);
        }
    }

    // Verificar se deve executar limpeza (uma vez por dia)
    shouldRunCleanup() {
        if (!this.lastCleanup) return true;

        const lastCleanupDate = new Date(this.lastCleanup);
        const now = new Date();
        const oneDayInMs = 24 * 60 * 60 * 1000;

        return (now.getTime() - lastCleanupDate.getTime()) > oneDayInMs;
    }

    // Executar limpeza automática
    async runAutomaticCleanup() {
        if (!this.shouldRunCleanup()) {
            console.log('⏰ Limpeza já executada hoje');
            return { success: true, skipped: true };
        }

        return await this.markExpiredEventsAsInactive();
    }

    // Buscar apenas eventos ativos (para usar no frontend)
    async getActiveEvents() {
        if (!this.supabase) {
            throw new Error('Supabase não inicializado');
        }

        const { data, error } = await this.supabase
            .from('eventos')
            .select('*')
            .eq('ativo', true)
            .order('data_inicio', { ascending: true });

        if (error) throw error;
        return data || [];
    }

    // Reativar evento (caso necessário)
    async reactivateEvent(eventId) {
        const { error } = await this.supabase
            .from('eventos')
            .update({
                ativo: true,
                data_remocao: null
            })
            .eq('id', eventId);

        if (error) throw error;
        return { success: true };
    }

    // Estatísticas de limpeza
    async getCleanupStats() {
        try {
            const { data: logs } = await this.supabase
                .from('log_eventos_removidos')
                .select('*')
                .order('data_execucao', { ascending: false })
                .limit(10);

            const { data: activeCount } = await this.supabase
                .from('eventos')
                .select('id', { count: 'exact' })
                .eq('ativo', true);

            const { data: inactiveCount } = await this.supabase
                .from('eventos')
                .select('id', { count: 'exact' })
                .eq('ativo', false);

            return {
                recentLogs: logs || [],
                activeEvents: activeCount?.length || 0,
                inactiveEvents: inactiveCount?.length || 0,
                lastCleanup: this.lastCleanup
            };
        } catch (error) {
            console.error('Erro ao buscar estatísticas:', error);
            return null;
        }
    }
}

// Instância global
window.eventCleanupManager = new EventCleanupManager();

// Executar limpeza automática quando a página carregar
document.addEventListener('DOMContentLoaded', async () => {
    const manager = window.eventCleanupManager;

    // Aguardar um pouco para não interferir no carregamento inicial
    setTimeout(async () => {
        try {
            const result = await manager.runAutomaticCleanup();

            if (result.success && result.removed > 0) {
                console.log(`🎉 Limpeza concluída: ${result.removed} eventos removidos`);
            }
        } catch (error) {
            console.error('Erro na limpeza automática:', error);
        }
    }, 2000);
});

// Exportar para uso em outros scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventCleanupManager;
}