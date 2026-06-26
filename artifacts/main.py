import os
import json
from flask import Flask, request, jsonify, render_template
import google.generativeai as genai
from PIL import Image
import io

app = Flask(__name__)

# Configure Gemini API using the secure Replit secret
api_key = os.environ.get("GEMINI_API_KEY")
if not api_key:
    raise ValueError("GEMINI_API_KEY secret is missing. Please add it to Replit Secrets.")

genai.configure(api_key=api_key)

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

        # Use gemini-2.5-flash for fast, multimodal image understanding
        model = genai.GenerativeModel('gemini-2.5-flash')
        
        # Explicitly instruct Gemini to extract text and format it as clean JSON
        prompt = """
        Analyze this image. It contains a paper strip stuck to a mobile phone with details written on it.
        Extract the following three fields and return them strictly in JSON format with these exact keys:
        - "name": The customer's name.
        - "contact": The phone or contact number found.
        - "problem": The description of the device issue.
        
        If a field is missing, set its value to null. Do not include any markdown formatting, markdown code blocks (like ```json), or extra conversational text. Return only the raw JSON string.
        """

        response = model.generate_content([prompt, pil_image])
        
        # Clean up response text just in case the model includes markdown blocks
        clean_text = response.text.replace("```json", "").replace("```", "").strip()
        data = json.loads(clean_text)
        
        return jsonify(data)

    except Exception as e:
        return jsonify({"error": f"Failed to process image: {str(e)}"}), 500

if __name__ == '__main__':
    # Run the server on Replit's default host and port
    app.run(host='0.0.0.0', port=8080)
