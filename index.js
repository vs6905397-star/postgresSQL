import express from "express";
import pool from "./db.js"

const app = express();

app.use(express.json());

app.get("/", async(req, res) =>{
    try {
        const result = await pool.query("SELECT current_user, current_database()");

        res.json(result.rows);

    } catch (error) {
        console.error(error);
        res.status(500).send("Database connection failed")
    }
});

app.get("/users", async(req, res) => {
    try {
        const result = await pool.query("SELECT * FROM users");

        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).send("failed to fetch users")
    }
})

app.post("/users", async(req, res) => {
    try {
        const { id, name, age, city, salary, email } = req.body;

        const result = await pool.query
          (`INSERT INTO users (id, name, age, city, salary, email)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (email)
           DO UPDATE
           SET name = EXCLUDED.name,
               age = EXCLUDED.age,
               city = EXCLUDED.city,
               salary = EXCLUDED.salary
           RETURNING *`,
           [id, name, age, city, salary, email]
          );

          if(result.rows.length === 0){
            return res.status(409).json({
                message:"Email alrady exist"
            })
          };

          res.status(200).json(result.rows[0]);

    } catch (error) {
        console.error(error);
        res.status(500).send("failed to create users")
    }
})

app.patch("/users/:id", async(req, res) => {
    try {
  
        const { id } = req.params;
        const { name, age, city, salary, email } = req.body;

        const result = await pool.query
          (`UPDATE users 
            SET name = $1,
                age = $2,
                city = $3,
                salary = $4,
                email = $5
            WHERE id = $6
           RETURNING *`,
           [name, age, city, salary, email, id]
          );

          if(result.rows.length === 0){
            return res.status(404).json({
                message: "user not found"
            })
          };

          res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error(error);
        res.status(500).send("failed to update users")
    }
})

app.delete("/users/:id", async(req, res) => {
    try {
  
        const { id } = req.params;

        const result = await pool.query
          (`DELETE FROM users
            WHERE id = $1
            RETURNING *`,
            [id]
          );

          if(result.rows.length === 0){
            return res.status(404).json({
                message: "user not found"
            })
          };

          res.json({
            message: "user deleted",
            user: result.rows[0]
          });

    } catch (error) {
        console.error(error);
        res.status(500).send("failed to delete users")
    }
})

app.get("/orders", async(req, res) => {
    try {
        const result = await pool.query(
            `SELECT 
            o.id AS order_id,
            u.name AS user_name,
            p.name AS product_name,
            o.quantity
            FROM orders o
            JOIN users u
                 ON o.user_id = u.id
            JOIN products p
                 ON o.product_id = p.id`
        );          

        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).send("failed to fetch orders")
    }
})

app.get("/users/:id/orders", async(req, res) => {
    try {
  
        const { id } = req.params;

        if(isNaN(id)){
            return res.status(400).json({
                message: "Invalid user id"
            })
          };

         const userResult = await pool.query(`SELECT id, name FROM users WHERE id = $1`, [id]);

         if(userResult.rows.length === 0){
            return res.status(404).json({
                message: "user not found"
            })
          };

        const orderResult = await pool.query
          (`SELECT 
            o.id AS order_id,
            u.name AS user_name,
            p.name AS product_name,
            o.quantity
            FROM orders o
            JOIN users u
                 ON o.user_id = u.id
            JOIN products p
                 ON o.product_id = p.id
            WHERE u.id = $1`,
           [id]
          );

          res.status(200).json(
           { user: userResult.rows[0],
            orders: orderResult.rows[0]}
          );

    } catch (error) {
        console.error(error);
        res.status(500).send("failed to get orderbyId")
    }
})


app.post("/orders", async(req,res) => {
    const {id, user_id, product_id, quantity} = req.body;

        if(![id, user_id, product_id, quantity].every((value) => Number.isInteger(Number(value)) && Number(value) > 0)){
            return res.status(400).json({
                message: "All fields must be positive intergers"
            })
        }

        const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const stockResult = await client.query(`
            UPDATE products 
            SET stock = stock - $1
            WHERE id = $2 AND stock >= $1
            RETURNING id, stock`,
            [quantity, product_id]
         );

        if(stockResult.rows.length === 0){
            const error = new Error("Product not found or insufficient stock");
            error.status(400);
            throw error;
        } 

        const orderResult = await client.query(`
            INSERT INTO orders (id, user_id, product_id, quantity)
            VALUES ($1, $2, $3, $4)
            RETURNING *`,
            [id, user_id, product_id, quantity]
        );

        await client.query("COMMIT");

        res.status(201).json({
            message:"order placed successfully",
            order: orderResult.rows[0],
            remanining_stock: stockResult.rows[0].stock
        })
        
    } catch (error) {
        await client.query("ROLLBACK");
        console.error(error);
        res.status(
            error.status || (error.code === '23505' ? 409 : 
                error.code === '23503' ? 400 : 500
            )
        ).json({
            message:"faild to place order"
        })
    }
})


app.get("/order-details", async(req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM order_details"
        );

        res.json(result.rows);

    } catch (error) {
         console.error(error);
         res.status(500).json({
             message:"faild to fetch orders"
         })
    }
})

const PORT = process.env.PORT || 5000;

app.listen(PORT, ()=>{
    console.log(`server running on ${PORT}`);
});