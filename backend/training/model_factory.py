"""
model_factory.py

Builds PyTorch models for Pipeline Rakshak retraining.

Supported architectures
-----------------------
- mobilenetv2    (torchvision MobileNet_V2)
- efficientnetb0 (torchvision EfficientNet_B0)
- resnet50       (torchvision ResNet50)
- convnext_base  (torchvision ConvNeXt_Base)

Training modes
--------------
- classifier_only  : freeze backbone, train head only
- partial_finetune : freeze early layers, unfreeze last ~30 %
- full_finetune    : unfreeze all parameters
"""

from __future__ import annotations

from typing import cast

import torch.nn as nn
import torchvision.models as tv


# ── name normalisation ────────────────────────────────────────────────────────

def _normalise(name: str) -> str:
    """Strip common DB suffixes so names like 'mobilenetv2_standard' resolve."""
    return (
        name.lower()
        .replace("_standard", "")
        .replace("_augmented", "")
        .replace("-", "_")
        .replace(" ", "_")
    )


# ── freeze helpers ────────────────────────────────────────────────────────────

def _freeze_all(model: nn.Module) -> None:
    for p in model.parameters():
        p.requires_grad = False


def _unfreeze_all(model: nn.Module) -> None:
    for p in model.parameters():
        p.requires_grad = True


def _unfreeze_head(model: nn.Module) -> None:
    for attr in ("classifier", "fc", "head", "heads"):
        module = getattr(model, attr, None)
        if module is not None:
            for p in module.parameters():
                p.requires_grad = True


def _partial_unfreeze(model: nn.Module, keep_frozen_ratio: float = 0.7) -> None:
    params = list(model.parameters())
    cut = int(len(params) * keep_frozen_ratio)
    for i, p in enumerate(params):
        p.requires_grad = i >= cut


def _apply_mode(model: nn.Module, mode: str) -> nn.Module:
    if mode == "classifier_only":
        _freeze_all(model)
        _unfreeze_head(model)
    elif mode == "partial_finetune":
        _partial_unfreeze(model, keep_frozen_ratio=0.7)
        _unfreeze_head(model)
    elif mode == "full_finetune":
        _unfreeze_all(model)
    else:
        raise ValueError(f"Unknown training_mode: '{mode}'")
    return model


# ── per-architecture builders ─────────────────────────────────────────────────

def _mobilenetv2(num_classes: int, pretrained: bool) -> nn.Module:
    weights = tv.MobileNet_V2_Weights.IMAGENET1K_V1 if pretrained else None
    model = tv.mobilenet_v2(weights=weights)
    in_features = cast(nn.Linear, model.classifier[1]).in_features
    model.classifier[1] = nn.Linear(in_features, num_classes)
    return model


def _efficientnetb0(num_classes: int, pretrained: bool) -> nn.Module:
    weights = tv.EfficientNet_B0_Weights.IMAGENET1K_V1 if pretrained else None
    model = tv.efficientnet_b0(weights=weights)
    in_features = cast(nn.Linear, model.classifier[1]).in_features
    model.classifier[1] = nn.Linear(in_features, num_classes)
    return model


def _resnet50(num_classes: int, pretrained: bool) -> nn.Module:
    weights = tv.ResNet50_Weights.IMAGENET1K_V1 if pretrained else None
    model = tv.resnet50(weights=weights)
    in_features = model.fc.in_features
    model.fc = nn.Linear(in_features, num_classes)
    return model


def _convnext_base(num_classes: int, pretrained: bool) -> nn.Module:
    weights = tv.ConvNeXt_Base_Weights.IMAGENET1K_V1 if pretrained else None
    model = tv.convnext_base(weights=weights)
    in_features = cast(nn.Linear, model.classifier[2]).in_features
    model.classifier[2] = nn.Linear(in_features, num_classes)
    return model


# ── registry ──────────────────────────────────────────────────────────────────

_REGISTRY = {
    "mobilenetv2":     _mobilenetv2,
    "mobilenet_v2":    _mobilenetv2,
    "efficientnetb0":  _efficientnetb0,
    "efficientnet_b0": _efficientnetb0,
    "resnet50":        _resnet50,
    "convnext_base":   _convnext_base,
    "convnext":        _convnext_base,
}


# ── public API ────────────────────────────────────────────────────────────────

def get_model(
    model_name: str,
    num_classes: int = 2,
    pretrained: bool = True,
    training_mode: str = "full_finetune",
) -> nn.Module:
    """
    Build and return a PyTorch model ready for training.

    model_name accepts full DB names like ``"mobilenetv2_standard"``
    as well as short names like ``"mobilenetv2"``.
    """
    key = _normalise(model_name)
    builder = _REGISTRY.get(key)
    if builder is None:
        raise ValueError(
            f"Unsupported model '{model_name}'. "
            f"Supported keys: {sorted(_REGISTRY.keys())}"
        )
    model = builder(num_classes=num_classes, pretrained=pretrained)
    _apply_mode(model, training_mode)
    return model


def count_trainable_parameters(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters() if p.requires_grad)