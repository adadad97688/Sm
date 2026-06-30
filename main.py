import os
import json
import base64
import requests
import concurrent.futures
from flask import Flask, request, jsonify, render_template, Response
from google import genai
from PIL import Image
import io

app = Flask(__name__)

# Securely grab API Keys
gemini_key = os.environ.get("GEMINI_API_KEY")
imgbb_key = os.environ.get("IMGBB_API_KEY")

if not gemini_key or not imgbb_key:
    raise ValueError("Missing API Keys in Replit Secrets (GEMINI_API_KEY or IMGBB_API_KEY).")

client = genai.Client(api_key=gemini_key)

def upload_to_imgbb(image_bytes):
    imgbb_url = "https://api.imgbb.com/1/upload"
    payload = {
        "key": imgbb_key,
        "image": base64.b64encode(image_bytes).decode('utf-8')
    }
    response = requests.post(imgbb_url, data=payload).json()
    if 'data' not in response:
        raise Exception("ImgBB upload failed")
    return response['data']['url']

def analyze_with_gemini(pil_image):
    prompt = """
    CRITICAL INSTRUCTION: Analyze this image meticulously. You are looking at a handwritten or printed paper strip attached to a phone. 
    Do NOT ignore any lines of text, even if faintly written, messy, or abbreviated. Read the entire paper strip top to bottom.
    
    Extract the following fields and return them strictly in JSON format with these exact keys:
    - "name": The customer's name (look closely at the first line).
    - "contact": The phone or contact number (look for a sequence of digits).
    - "problem": The description of the device issue (combine all text regarding the fault).
    - "price": The repair cost or price if written (look for currency symbols or numbers at the bottom).
    
    If a field is truly missing, set its value to null. Return ONLY the raw JSON string. Do not include markdown code blocks.
    """
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=[prompt, pil_image],
        config={"response_mime_type": "application/json"}
    )
    return json.loads(response.text)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/firebase-config')
def firebase_config():
    return jsonify({
        "apiKey": os.environ.get("FIREBASE_API_KEY", ""),
        "authDomain": os.environ.get("FIREBASE_AUTH_DOMAIN", ""),
        "projectId": os.environ.get("FIREBASE_PROJECT_ID", ""),
        "storageBucket": os.environ.get("FIREBASE_STORAGE_BUCKET", ""),
        "messagingSenderId": os.environ.get("FIREBASE_MESSAGING_SENDER_ID", ""),
        "appId": os.environ.get("FIREBASE_APP_ID", "")
    })

# THE BASE64 FIX: Converts the image to raw text so html2canvas never hits a security block
@app.route('/api/proxy-image')
def proxy_image():
    img_url = request.args.get('url')
    if not img_url:
        return jsonify({"error": "No URL provided"}), 400
    try:
        # User-Agent prevents ImgBB from blocking the backend request
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        resp = requests.get(img_url, headers=headers)
        resp.raise_for_status() 
        
        # Convert image bytes to Base64 text
        encoded = base64.b64encode(resp.content).decode('utf-8')
        mime = resp.headers.get('Content-Type', 'image/jpeg')
        
        return jsonify({"base64": f"data:{mime};base64,{encoded}"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


from flask import send_from_directory

@app.route('/.well-known/assetlinks.json')
def asset_links():
    return send_from_directory('static', 'assetlinks.json', mimetype='application/json')


@app.route('/scan-image', methods=["POST"])
def scan_image():
    if 'image' not in request.files or request.files['image'].filename == '':
        return jsonify({"error": "No valid image file provided"}), 400

    try:
        image_bytes = request.files['image'].read()
        pil_image = Image.open(io.BytesIO(image_bytes))
        
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future_imgbb = executor.submit(upload_to_imgbb, image_bytes)
            future_gemini = executor.submit(analyze_with_gemini, pil_image)
            
            permanent_image_url = future_imgbb.result()
            data = future_gemini.result()

        data['image_url'] = permanent_image_url
        return jsonify(data)

    except Exception as e:
        return jsonify({"error": f"Processing failed: {str(e)}"}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
