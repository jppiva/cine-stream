require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// Obter connection string a partir de env var ou argumento
const connectionString = process.env.DATABASE_URL || process.argv[2] || null;
const useSsl = (process.env.DB_SSL || 'false') === 'true';

let pool = null;
if (connectionString) {
  pool = new Pool({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  });
  console.log('Conexão com banco habilitada.');
} else {
  console.warn('Nenhuma DATABASE_URL fornecida. Endpoints usarão dados de exemplo (fallback).');
}

// Dados de exemplo (quando não há banco configurado)
const SAMPLE_CATEGORIES = [
  { name: 'Ação' },
  { name: 'Drama' },
  { name: 'Comédia' },
  { name: 'Animação' },
  { name: 'Anime' }
];

const SAMPLE_MOVIES = [
  { id: 1, title: 'Perfect Blue', poster_url: '/assets/images/perfect-blue.svg', category: 'Anime' },
  { id: 2, title: 'Toy Story', poster_url: '/assets/images/toy story.jpg', category: 'Animação' },
  { id: 3, title: 'Mob Psycho 100', poster_url: '/assets/images/Mob Psycho 100.jpg', category: 'Anime' },
  { id: 4, title: 'Demon Slayer', poster_url: '/assets/images/Demon Slayer.jpg', category: 'Anime' },
  { id: 5, title: 'Re:Zero', poster_url: '/assets/images/ReZero.jpg', category: 'Anime' }
];

app.get('/', (req, res) => {
  res.json({ ok: true, message: 'Cine-stream API', db: !!pool });
});

// Helper: executar query segura quando pool existir
async function tryQuery(queryText, params = []) {
  if (!pool) throw new Error('no-db');
  return pool.query(queryText, params);
}

// GET /api/categories
app.get('/api/categories', async (req, res) => {
  try {
    if (pool) {
      // Primeiro, tentar tabela 'categories' (se existir)
      try {
        const result = await tryQuery('SELECT id, name FROM categories ORDER BY name');
        if (result.rows && result.rows.length > 0) return res.json(result.rows.map(r => ({ id: r.id, name: r.name })));
      } catch (e) {
        // ignora, tenta fallback
      }

      // Fallback: categorias distintas na tabela movies
      try {
        const r2 = await tryQuery("SELECT DISTINCT category FROM movies WHERE category IS NOT NULL ORDER BY category");
        const rows = r2.rows.map(r => ({ name: r.category }));
        return res.json(rows);
      } catch (e) {
        console.warn('Erro ao consultar movies para categorias, retornando fallback de amostra.', e.message);
      }
    }

    // Sem DB ou falha: retornar dados de exemplo
    res.json(SAMPLE_CATEGORIES);
  } catch (err) {
    console.error('Erro em /api/categories', err);
    res.status(500).json({ error: 'Erro ao buscar categorias' });
  }
});

// GET /api/movies?category=Nome
app.get('/api/movies', async (req, res) => {
  try {
    const { category } = req.query;
    if (pool) {
      let query = 'SELECT id, title, poster_url, category FROM movies';
      const params = [];
      if (category) {
        query += ' WHERE category = $1';
        params.push(category);
      }
      query += ' ORDER BY id LIMIT 1000';
      try {
        const result = await tryQuery(query, params);
        return res.json(result.rows);
      } catch (e) {
        console.warn('Erro ao consultar filmes no DB, usando fallback de amostra.', e.message);
      }
    }

    // Sem DB: filtrar SAMPLE_MOVIES
    const filtered = category ? SAMPLE_MOVIES.filter(m => m.category && m.category.toLowerCase() === String(category).toLowerCase()) : SAMPLE_MOVIES;
    res.json(filtered);
  } catch (err) {
    console.error('Erro em /api/movies', err);
    res.status(500).json({ error: 'Erro ao buscar filmes' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`API rodando na porta ${port} (DB ${pool ? 'habilitado' : 'desabilitado'})`);
});
