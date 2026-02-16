import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { supabase } from "../utils/supabase";
import { openai } from "../utils/openai";

const router = express.Router();

// Rota para Busca RAG
router.post("/search", async (req, res) => {
    try {
        const { query } = req.body;

        if (!query) {
            return res.status(400).json({ error: "Query de busca é obrigatória" });
        }

        // 1. Gerar Embedding da Query usando OpenAI
        const embeddingResponse = await openai.embeddings.create({
            model: "text-embedding-ada-002",
            input: query,
        });

        const embedding = embeddingResponse.data[0].embedding;

        // 2. Buscar no Supabase usando RPC (match_documents)
        if (!supabase) {
            return res.status(500).json({ error: "Supabase credentials not configured in server" });
        }

        // Busca em Documentos Processados (PDFs/Imagens antigos)
        const { data: documents, error: docError } = await supabase.rpc("match_processed_records", {
            query_embedding: embedding,
            match_threshold: 0.4, // Reduzido drasticamente para 0.4
            match_count: 5,
        });

        // Busca em Transcrições de Áudio
        const { data: audioDocs, error: audioError } = await supabase.rpc("match_audio_transcriptions", {
            query_embedding: embedding,
            match_threshold: 0.4, // Reduzido para 0.4
            match_count: 5,
        });

        // NOVA BUSCA: Busca em Extrações de Texto (Emails/Textos do WeWeb)
        const { data: textDocs, error: textError } = await supabase.rpc("match_text_extractions", {
            query_embedding: embedding,
            match_threshold: 0.4, // Reduzido para 0.4
            match_count: 5,
        });

        console.log("DEBUG BUSCA:", {
            textDocsLength: textDocs?.length || 0,
            textError: textError,
            docDocsLength: documents?.length || 0,
            audioDocsLength: audioDocs?.length || 0
        });

        if (docError && audioError && textError) {
            console.error("Erro na busca TOTAL:", { docError, audioError, textError });
            return res.status(500).json({ error: "Erro ao buscar em todas as fontes." });
        }

        // Combinar resultados
        const allResults = [
            ...(documents || []).map((d: any) => ({ ...d, type: 'document' })),
            ...(audioDocs || []).map((d: any) => ({ ...d, type: 'audio' })),
            ...(textDocs || []).map((d: any) => ({ ...d, type: 'text' }))
        ];

        // Se não achar nada
        if (allResults.length === 0) {
            return res.json({ results: [], message: "Nenhum documento encontrado com threshold 0.4" });
        }

        return res.json({ results: allResults, count: allResults.length });

    } catch (error: any) {
        console.error("Erro interno:", error);
        res.status(500).json({ error: "Erro interno do servidor", details: error.message });
    }
});

export default router;
