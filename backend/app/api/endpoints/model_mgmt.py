# backend/app/api/endpoints/model_mgmt.py

from fastapi import APIRouter, HTTPException, Body
import logging
from typing import List, Dict

# Assuming a singleton instance of the service is created and available for import.
# If the service is not instantiated as a singleton, you might need to do:
# from backend.app.services.inference import ONNXInferenceService
# inference_service = ONNXInferenceService()
# For now, we follow the previous pattern of importing a ready instance.
from backend.app.services.inference import inference_service
from backend.app import schemas

router = APIRouter()
log = logging.getLogger(__name__)

@router.get("/models", response_model=List[str], tags=["Model Management"])
def get_available_models():
    """
    Retrieves a list of available ONNX model names that can be loaded.
    These models are discovered by scanning the designated model directory.
    """
    try:
        log.info("Listing available ONNX models.")
        available_models = inference_service.list_available_models()
        if not available_models:
            # This is not an error, but a valid state. An empty list is a valid response.
            return []
        return available_models
    except Exception as e:
        log.error("Failed to list models.", exc_info=True)
        # Catching unexpected errors during model listing.
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred while retrieving model list: {e}"
        )

@router.get("/list", response_model=Dict[str, str | List[str]], tags=["Model Management"])
def get_model_list():
    """
    Returns all available models along with the currently active model.

    Response:
    {
      "available_models": ["model_a", "model_b"],
      "active_model": "model_a"
    }
    """
    try:
        log.info("Fetching available models and active model.")
        available_models = inference_service.list_available_models()
        active_model = inference_service.get_active_model() or ""
        return {
            "available_models": available_models,
            "active_model": active_model
        }
    except Exception as e:
        log.error("Failed to fetch model list.", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred while retrieving model list: {e}"
        )

@router.post("/models/select", response_model=Dict[str, str], tags=["Model Management"])
def select_model(model_selection: schemas.ModelSelection = Body(...)):
    """
    Selects and loads a specific ONNX model to be used for subsequent inference tasks.
    
    - **model_name**: The name of the model to load (e.g., "yolov8n_corrosion").
                      Do not include the .onnx extension.
    """
    model_name = model_selection.model_name
    try:
        # The list_available_models method returns names without extension.
        if model_name not in inference_service.list_available_models():
            raise HTTPException(
                status_code=404,
                detail=f"Model '{model_name}' not found. Available models: {', '.join(inference_service.list_available_models())}"
            )

        # Attempt to load the model
        success = inference_service.load_model(model_name)

        if success:
            return {"message": f"Successfully loaded and selected model: '{model_name}'"}
        else:
            # If load_model returns False, it means loading failed for a reason logged by the service.
            raise HTTPException(
                status_code=500,
                detail=f"Failed to load model '{model_name}'. The model may be corrupt or incompatible. Check server logs for details."
            )
    except HTTPException as http_exc:
        # Re-raise HTTPException to prevent it from being caught by the general Exception handler.
        raise http_exc
    except Exception as e:
        # Catch any other unexpected errors during the loading process.
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected server error occurred while trying to load the model '{model_name}': {e}"
        )

@router.get("/models/current", response_model=Dict[str, str], tags=["Model Management"])
def get_current_model():
    """
    Returns the name of the currently active ONNX model.
    """
    active_model = inference_service.get_active_model()
    if not active_model:
        raise HTTPException(status_code=404, detail="No model is currently loaded or active.")
    return {"active_model": active_model}

