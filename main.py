import os
import json
from flask import Flask, request, jsonify, render_template
from google import genai
from PIL import Image
import io

app = Flask(__name__)

# Configure Gemini API using the secure Replit secret
api_key = os.environ.get("GEMINI_API_KEY")
if not api_key:
    raise ValueError("GEMINI_API_KEY secret is missing. Please add it to Replit Secrets.")

# Initialize the new GenAI client
client = genai.Client(api_key=api_key)

@app.route('/')
def index():
    # Renders the main mobile UI dashboard
    return render_template('index.html')

@app.route('/scan-image', methods=["POST"])
def scan_image():
    if 'image' not in request.files:
        return jsonify({"error": "No image file provided"}), 400
        
    file = request.files['image']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    try:
        # Open the uploaded image file using Pillow
        image_bytes = file.read()
        pil_image = Image.open(io.BytesIO(image_bytes))
        
        prompt = """
        Analyze this image. It contains a paper strip stuck to a mobile phone with details written on it.
        Extract the following three fields and return them strictly in JSON format with these exact keys:
        - "name": The customer's name.
        - "contact": The phone or contact number found.
        - "problem": The description of the device issue.
        
        If a field is missing, set its value to null.
        """

        # Generate content using the new SDK syntax and explicitly request JSON
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[prompt, pil_image],
            config={"response_mime_type": "application/json"}
        )
        
        # Parse the guaranteed JSON response
        data = json.loads(response.text)
        return jsonify(data)

    except Exception as e:
        return jsonify({"error": f"Failed to process image: {str(e)}"}), 500

if __name__ == '__main__':
    # Run the server on Replit's default host and port
    app.run(host='0.0.0.0', port=8080)
