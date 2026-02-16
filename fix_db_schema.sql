-- 1. DROP na função antiga para corrigir o erro "cannot change return type"
DROP FUNCTION IF EXISTS match_text_extractions(vector, float, int);
DROP FUNCTION IF EXISTS match_text_extractions(vector, double precision, int);

-- 2. Garante que a extensão vector existe
create extension if not exists vector;

-- 3. Cria apenas a coluna 'summary' que FALTAVA (as outras usamos as suas!)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name='text_extractions' and column_name='summary') then
    alter table text_extractions add column summary text;
  end if;
end $$;

-- 4. Cria a função de busca atualizada usando suas colunas (raw_text, extracted_data)
create or replace function match_text_extractions (
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  source text,
  content text, -- Vamos retornar como 'content' para o front-end, mas lendo de 'raw_text'
  summary text,
  similarity float
)
language plpgsql
 as $$
begin
  return query
  select
    text_extractions.id,
    text_extractions.source,
    text_extractions.raw_text as content, -- Mapeia raw_text para content na resposta
    text_extractions.summary,
    1 - (text_extractions.embedding <=> query_embedding) as similarity
  from
    text_extractions
  where
    1 - (text_extractions.embedding <=> query_embedding) > match_threshold
  order by
    text_extractions.embedding <=> query_embedding
  limit match_count;
end;
$$;
