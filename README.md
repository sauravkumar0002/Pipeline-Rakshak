# 🛡️ Pipeline Rakshak

## AI-Based Pipeline Corrosion Detection & Monitoring Platform

**Pipeline Rakshak** is an end-to-end AI-powered platform designed to assist in the detection and monitoring of surface corrosion in pipeline images.

The system integrates a **deep-learning image classification model**, **ONNX Runtime inference**, **FastAPI backend**, **React frontend**, and **SQLite database** to provide a complete image-based inspection and monitoring platform.

It enables users to:

* Upload pipeline images for AI-based corrosion detection
* View prediction results with confidence scores
* Monitor inspection activities
* Maintain inspection history
* Verify or correct AI predictions
* Analyze inspection trends and statistics
* Manage supported ONNX models

---

## 📌 Project Overview

Pipeline corrosion is a major concern in industrial infrastructure. Prolonged corrosion can compromise pipeline integrity, increase maintenance requirements, and create significant safety risks.

**Pipeline Rakshak** provides an AI-assisted approach for analyzing pipeline images and identifying whether visible corrosion is present.

### 🔄 System Workflow

```text
Pipeline Image
      │
      ▼
Image Processing
      │
      ▼
Deep Learning Model
      │
      ▼
ONNX Inference
      │
      ▼
Corrosion Prediction
      │
      ▼
Confidence Score
      │
      ▼
Web Dashboard
      │
      ▼
Inspection History & Analytics
```

The platform combines an **AI inference layer** with a **web-based management interface**, allowing inspection results to be stored, reviewed, verified, and analyzed.

---

# 🎯 Objectives

The main objectives of Pipeline Rakshak are:

* Develop an AI-based pipeline corrosion detection system
* Automatically analyze pipeline images
* Provide corrosion/no-corrosion predictions with confidence scores
* Deploy the trained model using ONNX for efficient inference
* Provide a web interface for image-based inspection
* Maintain inspection history for future reference
* Allow users to verify or correct AI predictions
* Provide analytics and monitoring of inspection results
* Provide model management capabilities for supported ONNX models

---

# ✨ Key Features

## 🔍 AI Corrosion Detection

The system accepts a pipeline image and processes it using a trained deep-learning model to determine whether visible corrosion is present.

---

## 📊 Interactive Dashboard

The dashboard provides a centralized overview of inspection activities, including:

* Total inspections
* Detected corrosion
* Healthy/no-corrosion images
* Confidence information
* System-level inspection metrics

---

## 🎥 Live Monitoring

A dedicated monitoring interface is provided for observing pipeline inspection activities.

---

## 📋 Inspection History

Inspection results are stored in the database and can be accessed later.

Users can:

* View previous inspection records
* Review prediction results
* Inspect individual records
* Manage historical inspection data

---

## ✅ Prediction Verification

AI predictions can be manually reviewed and verified.

The verification module allows an incorrect prediction to be corrected, helping maintain reliable inspection records and supporting human-in-the-loop inspection workflows.

---

## 📈 Analytics

The platform provides analytical information including:

* Inspection summaries
* Dashboard KPIs
* Corrosion distribution
* Inspection trends
* Model performance information

---

## 🤖 Model Management

Pipeline Rakshak supports ONNX model management.

Users can:

* List available models
* Select the active model
* Retrieve information about the currently active model

---

## 🔌 REST API

The frontend communicates with the backend through REST APIs implemented using **FastAPI**.

This provides a structured communication layer between the web interface, AI inference pipeline, database, and model-management services.

---

# 🧠 AI Model

Pipeline Rakshak uses a **deep-learning image classification model** for corrosion detection.

The trained model is converted/exported into the **ONNX format** and used by the backend inference service.

## Model Format

```text
ONNX (.onnx)
```

## Default Model

```text
mobilenetv2_standard.onnx
```

## Class Mapping

The current classification setup uses two classes:

| Class Index | Class          |
| ----------: | -------------- |
|           0 | `corrosion`    |
|           1 | `no_corrosion` |

The class mapping is maintained in:

```text
backend/models/onnx/class_mapping.json
```

### Example

```json
{
  "default": {
    "labels": [
      "corrosion",
      "no_corrosion"
    ]
  }
}
```

---

# 🏗️ System Architecture

```text
                     ┌───────────────────────┐
                     │      User / Admin     │
                     └───────────┬───────────┘
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │     React + Vite      │
                     │       Frontend        │
                     │                       │
                     │ • Dashboard           │
                     │ • Detection            │
                     │ • Live Monitoring      │
                     │ • History              │
                     │ • Verification         │
                     │ • Analytics            │
                     │ • Model Management     │
                     └───────────┬───────────┘
                                 │
                              HTTP / REST
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │    FastAPI Backend    │
                     │                       │
                     │ • REST APIs            │
                     │ • Prediction Pipeline  │
                     │ • Analytics             │
                     │ • History Management   │
                     │ • Model Management     │
                     └───────────┬───────────┘
                                 │
                  ┌──────────────┴──────────────┐
                  │                             │
                  ▼                             ▼
       ┌─────────────────────┐       ┌─────────────────────┐
       │    ONNX Runtime     │       │   SQLite Database   │
       │                     │       │                     │
       │ Deep Learning Model │       │ Inspection Records  │
       │ Image Inference     │       │ History & Analytics │
       └─────────────────────┘       └─────────────────────┘
```

---

# 🔄 Prediction Workflow

```text
┌──────────────────┐
│ Upload Pipeline  │
│      Image       │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Image            │
│ Preprocessing    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Active ONNX      │
│ Model            │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ ONNX Runtime     │
│ Inference        │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Classification   │
│ Result           │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Confidence Score │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Display Result   │
│ on Web Interface │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Store Inspection │
│ in Database      │
└──────────────────┘
```

---

# 🛠️ Technology Stack

## 🧠 AI / Machine Learning

* Python
* PyTorch
* ONNX
* ONNX Runtime

## ⚙️ Backend

* Python
* FastAPI
* Uvicorn
* SQLAlchemy
* SQLite
* Alembic

## ⚛️ Frontend

* React
* JavaScript
* Vite
* HTML
* CSS

## 🐳 Deployment & Infrastructure

* Docker
* Docker Compose
* Netlify
* Render

## 🧪 Testing

* Pytest

---

# 📁 Project Structure

```text
Pipeline-Rakshak/
│
├── .github/
│   └── copilot-instructions.md
│
├── alembic/
│   ├── versions/
│   ├── env.py
│   ├── README
│   └── script.py.mako
│
├── backend/
│   ├── app/
│   ├── models/
│   │   └── onnx/
│   ├── training/
│   └── __init__.py
│
├── frontend/
│   ├── public/
│   │   ├── _redirects
│   │   ├── favicon.svg
│   │   ├── icons.svg
│   │   └── logo.png
│   │
│   ├── src/
│   │   ├── api/
│   │   ├── assets/
│   │   ├── components/
│   │   ├── contexts/
│   │   ├── layouts/
│   │   ├── pages/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── styles/
│   │   ├── utils/
│   │   ├── App.css
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   │
│   ├── .env.example
│   ├── .gitignore
│   ├── README.md
│   ├── eslint.config.js
│   ├── index.html
│   ├── package-lock.json
│   ├── package.json
│   └── vite.config.js
│
├── scripts/
│   ├── audit_state.py
│   ├── query_models.py
│   └── reset_training_cycle.py
│
├── tests/
│
├── .env.example
├── .gitignore
├── Dockerfile
├── README.md
├── alembic.ini
├── docker-compose.yml
├── netlify.toml
├── render.yaml
├── requirements-training.txt
├── requirements.txt
├── package.json
└── package-lock.json
```

---

# ⚙️ Installation

## Prerequisites

Make sure the following are installed:

* Python 3.11+
* Node.js 18+
* npm

---

## 1. Clone the Repository

```bash
git clone <repository-url>
cd Pipeline-Rakshak
```

---

# 🐍 Backend Setup

Install the Python dependencies:

```bash
pip install -r requirements.txt
```

Create the required directories:

```bash
mkdir uploads
mkdir reports
```

Start the FastAPI backend:

```bash
uvicorn backend.app.main:app --reload
```

The backend will be available at:

```text
http://localhost:8000
```

### FastAPI Swagger Documentation

```text
http://localhost:8000/docs
```

---

# ⚛️ Frontend Setup

Move into the frontend directory:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

The frontend will normally be available at:

```text
http://localhost:5173
```

---

# 🔐 Environment Variables

Environment-specific configuration can be maintained using a `.env` file.

The example configuration is provided in:

```text
.env.example
```

### Important Variables

| Variable            | Description                          |
| ------------------- | ------------------------------------ |
| `DATABASE_URL`      | Database connection                  |
| `UPLOAD_DIRECTORY`  | Directory for uploaded images        |
| `MODEL_DIRECTORY`   | Directory containing ONNX models     |
| `DEFAULT_MODEL`     | Default model used for inference     |
| `LOG_LEVEL`         | Application logging level            |
| `VITE_API_BASE_URL` | Backend API URL used by the frontend |

### Example Configuration

```env
DATABASE_URL=sqlite:///./corrosion_detection.db
UPLOAD_DIRECTORY=uploads
MODEL_DIRECTORY=backend/models/onnx
DEFAULT_MODEL=mobilenetv2_standard.onnx
LOG_LEVEL=INFO
VITE_API_BASE_URL=http://localhost:8000
```

---

# 🔌 API

Pipeline Rakshak exposes REST APIs through FastAPI.

## Inspection APIs

| Method   | Endpoint                           | Description                                      |
| -------- | ---------------------------------- | ------------------------------------------------ |
| `POST`   | `/api/v1/inspections/predict`      | Upload an image and perform corrosion prediction |
| `GET`    | `/api/v1/inspections/history`      | Retrieve inspection history                      |
| `GET`    | `/api/v1/inspections/history/{id}` | Retrieve a specific inspection                   |
| `DELETE` | `/api/v1/inspections/history/{id}` | Delete an inspection                             |
| `POST`   | `/api/v1/inspections/verify/{id}`  | Verify or correct a prediction                   |

## Analytics APIs

| Method | Endpoint                                  | Description                    |
| ------ | ----------------------------------------- | ------------------------------ |
| `GET`  | `/api/v1/analytics/summary`               | Retrieve inspection summary    |
| `GET`  | `/api/v1/analytics/dashboard`             | Retrieve dashboard KPIs        |
| `GET`  | `/api/v1/analytics/performance`           | Retrieve model performance     |
| `GET`  | `/api/v1/analytics/severity-distribution` | Retrieve severity distribution |
| `GET`  | `/api/v1/analytics/trends`                | Retrieve inspection trends     |

## Model APIs

| Method | Endpoint                        | Description               |
| ------ | ------------------------------- | ------------------------- |
| `GET`  | `/api/v1/models/list`           | List available models     |
| `POST` | `/api/v1/models/models/select`  | Select the active model   |
| `GET`  | `/api/v1/models/models/current` | Retrieve the active model |

## Health Check

```http
GET /health
```

The health endpoint provides information about the status of the backend and model.

---

# 🤖 Model Management

ONNX models are stored in:

```text
backend/models/onnx/
```

Class mappings are stored in:

```text
backend/models/onnx/class_mapping.json
```

### Adding a Supported Model

```text
1. Place the ONNX model inside backend/models/onnx/
                         ↓
2. Add its class mapping
                         ↓
3. Restart the backend
                         ↓
4. Select the model through the model-management API
```

The active model can be queried through:

```http
GET /api/v1/models/models/current
```

---

# 🗄️ Database

Pipeline Rakshak uses **SQLite** for storing application data.

**SQLAlchemy** provides the ORM layer, while **Alembic** is used for database migration management.

### Database Configuration

```env
DATABASE_URL=sqlite:///./corrosion_detection.db
```

The database stores information required for:

* Inspection history
* Prediction verification
* Analytics
* Inspection records

---

# 🐳 Docker Deployment

The project contains Docker configuration for containerized deployment.

Build and start the application using:

```bash
docker-compose up --build
```

The services are configured for:

```text
Frontend → http://localhost:5173
Backend  → http://localhost:8000
```

---

# ☁️ Deployment

The project contains deployment configuration for both frontend and backend services.

## Frontend

**Platform:** Netlify

Configuration:

```text
netlify.toml
```

## Backend

**Platform:** Render

Configuration:

```text
render.yaml
```

Docker configuration is also provided for containerized deployment.

---

# 🧪 Testing

Automated tests are included for important application components.

Run the test suite using:

```bash
python -m pytest tests/ -v
```

### Test Coverage Structure

```text
tests/
├── test_prediction_pipeline.py
├── test_api.py
└── test_analytics.py
```

---

# 📊 Platform Modules

Pipeline Rakshak is organized into three major functional areas:

```text
                     Pipeline Rakshak
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
      Detection        Monitoring       Management
          │                │                │
          ├── Image       ├── Dashboard   ├── Models
          ├── Prediction  ├── History     ├── Verification
          └── Confidence  └── Analytics   └── Settings
```

### Detection

* Image processing
* AI prediction
* Confidence scoring

### Monitoring

* Dashboard
* Inspection history
* Analytics

### Management

* Model management
* Prediction verification
* Application settings

---

# 🔒 Security & Configuration

Sensitive environment-specific values should **not** be committed directly to the repository.

Use:

```text
.env
```

for local configuration and keep sensitive credentials outside the source code.

The repository provides:

```text
.env.example
```

as a configuration template.

---

# 📈 Future Scope

The current platform can be extended in several directions:

* Larger and more diverse pipeline image datasets
* Further improvement of model accuracy and robustness
* Support for additional deep-learning architectures
* More advanced image preprocessing and augmentation
* Support for additional corrosion categories
* Improved real-time inspection capabilities
* Integration with industrial inspection systems
* Advanced analytics and predictive maintenance
* Edge-device deployment for field inspection
* Integration with additional sensor and inspection data

---

# 🌟 Project Highlights

```text
┌──────────────────────────────────────────────────────┐
│                   PIPELINE RAKSHAK                   │
├──────────────────────────────────────────────────────┤
│                                                      │
│  🧠 AI-Based Pipeline Corrosion Detection           │
│  🔍 Image-Based Inspection                           │
│  🤖 ONNX Model Inference                             │
│  📊 Interactive Monitoring Dashboard                 │
│  📋 Inspection History                               │
│  ✅ Prediction Verification                          │
│  📈 Analytics & Performance Monitoring               │
│  🔄 Model Management                                 │
│  🔌 REST API Architecture                            │
│  🗄️ Database-Backed Inspection Records              │
│  🐳 Docker Support                                   │
│  ☁️ Deployment Configuration                         │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

# 👨‍💻 Project Information

**Project Name:** Pipeline Rakshak

**Project Type:** AI-Based Pipeline Corrosion Detection & Monitoring Platform

### Primary Technologies

```text
Python
PyTorch
ONNX
ONNX Runtime
FastAPI
React
Vite
SQLite
SQLAlchemy
Alembic
Docker
Pytest
```

---

# 📜 License

This project is developed as an **academic/engineering project** for research, development, demonstration, and evaluation purposes.
