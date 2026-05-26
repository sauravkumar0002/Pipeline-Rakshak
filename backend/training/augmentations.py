"""
augmentations.py

Purpose
-------
Central augmentation and preprocessing module for
Pipeline Rakshak Retraining Engine.

Supports
--------
1. MobileNetV2
2. EfficientNetB0
3. ResNet50
4. ConvNeXt-Base

Features
--------
- Training augmentation pipeline
- Validation pipeline
- Test pipeline
- Configurable image size
- ImageNet normalization
- Jetson compatible
- ONNX compatible

Author
------
Pipeline Rakshak
"""

from torchvision import transforms


# ==========================================================
# IMAGENET NORMALIZATION
# ==========================================================

IMAGENET_MEAN = [
    0.485,
    0.456,
    0.406
]

IMAGENET_STD = [
    0.229,
    0.224,
    0.225
]


# ==========================================================
# NORMALIZATION
# ==========================================================

def imagenet_normalization():
    """
    ImageNet normalization.

    Required because all supported
    models use ImageNet pretrained weights.
    """

    return transforms.Normalize(
        mean=IMAGENET_MEAN,
        std=IMAGENET_STD
    )


# ==========================================================
# TRAIN TRANSFORM
# ==========================================================

def build_train_transform(
    image_size: int = 224
):
    """
    Training augmentations.

    Parameters
    ----------
    image_size : int

    Returns
    -------
    torchvision.transforms.Compose
    """

    return transforms.Compose([

        transforms.Resize(
            (
                image_size,
                image_size
            )
        ),

        transforms.RandomHorizontalFlip(
            p=0.5
        ),

        transforms.RandomVerticalFlip(
            p=0.2
        ),

        transforms.RandomRotation(
            degrees=15
        ),

        transforms.ColorJitter(
            brightness=0.2,
            contrast=0.2,
            saturation=0.2,
            hue=0.05
        ),

        transforms.ToTensor(),

        imagenet_normalization()
    ])


# ==========================================================
# VALIDATION TRANSFORM
# ==========================================================

def build_validation_transform(
    image_size: int = 224
):
    """
    Validation transform.

    No augmentation.
    """

    return transforms.Compose([

        transforms.Resize(
            (
                image_size,
                image_size
            )
        ),

        transforms.ToTensor(),

        imagenet_normalization()
    ])


# ==========================================================
# TEST TRANSFORM
# ==========================================================

def build_test_transform(
    image_size: int = 224
):
    """
    Test transform.

    Same as validation.
    """

    return transforms.Compose([

        transforms.Resize(
            (
                image_size,
                image_size
            )
        ),

        transforms.ToTensor(),

        imagenet_normalization()
    ])


# ==========================================================
# TRANSFORM FACTORY
# ==========================================================

def get_transforms(
    image_size: int = 224
):
    """
    Returns all transforms.

    Returns
    -------
    dict
    """

    return {

        "train": build_train_transform(
            image_size
        ),

        "val": build_validation_transform(
            image_size
        ),

        "test": build_test_transform(
            image_size
        )
    }


# ==========================================================
# MODEL IMAGE SIZE HELPER
# ==========================================================

def get_default_image_size(
    model_name: str
) -> int:
    """
    Return recommended image size.

    Current supported models:
    MobileNetV2
    EfficientNetB0
    ResNet50
    ConvNeXt-Base
    """

    model_name = model_name.lower()

    model_sizes = {

        "mobilenetv2": 224,

        "efficientnetb0": 224,

        "resnet50": 224,

        "convnext_base": 224
    }

    return model_sizes.get(
        model_name,
        224
    )


# ==========================================================
# TEST
# ==========================================================

if __name__ == "__main__":

    transforms_dict = get_transforms(
        image_size=224
    )

    print(
        "\nAvailable Transforms:"
    )

    for key in transforms_dict:

        print(
            f"- {key}"
        )