const pool = require("./db");

async function testDatabase() {
  try {
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log("Database connected successfully!");
    console.log("Tables:");

    result.rows.forEach((row) => {
      console.log("-", row.table_name);
    });
  } catch (error) {
    console.error("Database connection failed:");
    console.error(error.message);
  } finally {
    await pool.end();
  }
}

testDatabase();