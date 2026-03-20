from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from faster_whisper import WhisperModel
import logging

app = FastAPI()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    model = WhisperModel("base", device="cpu", compute_type="int8")
    logger.info(" Whisper model loaded")
except Exception as e:
    logger.error(f" Failed to load Whisper model: {e}")
    model = None

@app.get("/health")
async def health_check():
    return {"status": "ok", "model_loaded": model is not None}

@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):

    if not model:
        return JSONResponse({"error": "Model not loaded"}, status_code=500)
    
    try:
        audio_data = await audio.read()
        
        
        temp_path = f"/tmp/{audio.filename}"
        with open(temp_path, "wb") as f:
            f.write(audio_data)
        

        segments, info = model.transcribe(temp_path, language="en")
        text = " ".join([segment.text for segment in segments])
        
        logger.info(f"Transcribed: {text[:100]}...")
        return {"text": text.strip()}
        
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)