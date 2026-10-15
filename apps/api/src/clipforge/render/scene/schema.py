"""Pydantic v2 Scene Graph v1.1 data schema and validators."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class StrictBase(BaseModel):
    model_config = ConfigDict(extra="forbid", validate_assignment=True)


class BBox(StrictBase):
    x: float
    y: float
    w: Annotated[float, Field(gt=0)]
    h: Annotated[float, Field(gt=0)]


Point2D = tuple[float, float]


class ShapeConfig(StrictBase):
    type: Literal["rect", "ellipse", "lasso"]
    bbox: BBox
    points: list[Point2D] | None = None

    @model_validator(mode="after")
    def validate_shape(self) -> "ShapeConfig":
        if self.type == "lasso":
            if not self.points:
                raise ValueError("Shape type 'lasso' requires 'points'")
            if len(self.points) < 3:
                raise ValueError("Shape type 'lasso' requires at least 3 points")
            if len(self.points) > 200:
                raise ValueError(
                    f"Shape type 'lasso' exceeds maximum 200 points (got {len(self.points)})"
                )
        return self


class TransformConfig(StrictBase):
    cx: float
    cy: float
    w: Annotated[float, Field(gt=0)]
    h: Annotated[float, Field(gt=0)]
    rotation: float = 0.0
    lock_aspect: bool = True
    z: int = 0

    @field_validator("rotation", mode="after")
    @classmethod
    def normalize_rotation(cls, v: float) -> float:
        """Normalize rotation to (-180, 180]."""
        rot = (v + 180.0) % 360.0 - 180.0
        if rot <= -180.0:
            rot += 360.0
        return round(rot, 4)


class ShadowConfig(StrictBase):
    enabled: bool = False
    color: str = "#000000"
    alpha: Annotated[float, Field(ge=0.0, le=1.0)] = 0.5
    blur: Annotated[float, Field(ge=0.0)] = 20.0
    offset_x: float = 4.0
    offset_y: float = 10.0


class StyleConfig(StrictBase):
    opacity: Annotated[float, Field(ge=0.0, le=1.0)] = 1.0
    corner_radius: Annotated[float, Field(ge=0.0)] = 0.0
    border_width: Annotated[float, Field(ge=0.0)] = 0.0
    border_color: str = "#00FFCC"
    shadow: ShadowConfig = Field(default_factory=ShadowConfig)


class LayerConfig(StrictBase):
    id: str
    name: str = "Layer"
    source_id: str
    visible: bool = True
    locked: bool = False
    time_offset: float = 0.0
    shape: ShapeConfig
    transform: TransformConfig
    style: StyleConfig = Field(default_factory=StyleConfig)


class SourceConfig(StrictBase):
    id: str
    width: Annotated[int, Field(gt=0)]
    height: Annotated[int, Field(gt=0)]
    fps: Annotated[float, Field(gt=0)] = 30.0
    start: float = 0.0
    end: float = 0.0
    padding_before: float = 1.0


class GradientConfig(StrictBase):
    angle: float = 135.0
    stops: list[str] = Field(default_factory=lambda: ["#1a1a2e", "#16213e"])


class BackgroundConfig(StrictBase):
    type: Literal["blur_source", "solid", "gradient", "secondary_source"] = "blur_source"
    blur_sigma: Annotated[float, Field(ge=0.0)] = 20.0
    color: str = "#0D0D0D"
    gradient: GradientConfig | None = None
    secondary_source_id: str | None = None


class CanvasConfig(StrictBase):
    width: int = 1080
    height: int = 1920
    fps: Annotated[int, Field(gt=0, le=60)] = 30


class SubtitlesConfig(StrictBase):
    enabled: bool = True
    preset: str = "classic_white"
    position: str = "bottom"


class SceneGraph(StrictBase):
    version: str = "1.1"
    canvas: CanvasConfig = Field(default_factory=CanvasConfig)
    background: BackgroundConfig = Field(default_factory=BackgroundConfig)
    sources: list[SourceConfig] = Field(default_factory=list)
    layers: list[LayerConfig] = Field(default_factory=list)
    subtitles: SubtitlesConfig = Field(default_factory=SubtitlesConfig)

    @model_validator(mode="after")
    def validate_scene_constraints(self) -> "SceneGraph":
        # 1. Layer count cap
        if len(self.layers) > 12:
            raise ValueError(
                f"Maximum 12 layers permitted per scene (found {len(self.layers)})"
            )

        # 2. Unique layer IDs
        layer_ids = [layer.id for layer in self.layers]
        if len(layer_ids) != len(set(layer_ids)):
            seen = set()
            duplicates = [lid for lid in layer_ids if lid in seen or seen.add(lid)]  # type: ignore[func-returns-value]
            raise ValueError(f"Duplicate layer id(s) detected: {duplicates}")

        # 3. Source lookup map
        source_map = {src.id: src for src in self.sources}

        # 4. Validate layers against sources & clamp bounds
        for layer in self.layers:
            # Map frontend alias 'source_main' to primary source if needed
            if layer.source_id == "source_main" and "source_main" not in source_map and self.sources:
                layer.source_id = self.sources[0].id

            src = source_map.get(layer.source_id)
            if not src:
                raise ValueError(
                    f"Layer '{layer.id}' references unknown source_id '{layer.source_id}'"
                )

            # Validate bbox within source dimensions (tolerance 2px for floating inaccuracies)
            bbox = layer.shape.bbox
            if (
                bbox.x < -2.0
                or bbox.y < -2.0
                or (bbox.x + bbox.w) > (src.width + 2.0)
                or (bbox.y + bbox.h) > (src.height + 2.0)
            ):
                raise ValueError(
                    f"Layer '{layer.id}' shape bbox ({bbox.x}, {bbox.y}, {bbox.w}, {bbox.h}) "
                    f"exceeds source '{src.id}' dimensions ({src.width}x{src.height})"
                )

            # Validate lasso points within source dimensions
            if layer.shape.type == "lasso" and layer.shape.points:
                for px, py in layer.shape.points:
                    if px < -2.0 or px > (src.width + 2.0) or py < -2.0 or py > (src.height + 2.0):
                        raise ValueError(
                            f"Lasso point ({px}, {py}) exceeds source dimensions ({src.width}x{src.height})"
                        )

        # 5. Normalize z-indices to continuous 0..N-1
        sorted_layers = sorted(self.layers, key=lambda lyr: lyr.transform.z)
        for idx, layer in enumerate(sorted_layers):
            layer.transform.z = idx
        object.__setattr__(self, "layers", sorted_layers)

        return self
