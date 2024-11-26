const express = require('express');
const axios = require('axios');
const cors = require('cors'); // To allow requests from frontend

const app = express();
const port = 3000;

// Enable CORS so the frontend can make requests to the server
app.use(cors());

// Replace with your Canvas API URL and API key
const CANVAS_API_URL = 'https://canvas.instructure.com/api/v1/courses';
const CANVAS_API_KEY = '';

// Route to fetch active courses from Canvas API
app.get('/api/courses', async (req, res) => {
    try {
        const response = await axios.get(CANVAS_API_URL, {
            headers: {
                'Authorization': `Bearer ${CANVAS_API_KEY}`
            }
        });

        // Send the list of active courses back to the frontend
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching courses:', error);
        res.status(500).send('Error fetching courses');
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
