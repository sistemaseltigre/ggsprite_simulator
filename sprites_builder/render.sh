#!/bin/bash

# Ensure ImageMagick is installed
if ! command -v magick &> /dev/null; then
    echo "Error: ImageMagick is not installed. Please install it first (e.g., 'brew install imagemagick' on macOS)."
    exit 1
fi

# Define sprites directory
# Default: current folder where this script lives (override with first arg)
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
SPRITES_DIR="${1:-$SCRIPT_DIR}"

# Define animation folders to check
ALL_FOLDERS=("Idle" "Walk" "Attack")
FRAME_SIZE="128x128"

# Define the views and their frame ranges
VIEWS=("front" "right" "back" "left")
FRAME_RANGES=("1 9" "10 18" "19 27" "28 36")

# Function to display character selection menu
select_character() {
    echo "Available characters:"
    local characters=()
    while IFS= read -r -d '' dir; do
        characters+=("$dir")
    done < <(find "$SPRITES_DIR" -maxdepth 1 -type d -not -path "$SPRITES_DIR" -print0 | sort -z)

    if [ ${#characters[@]} -eq 0 ]; then
        echo "Error: No character folders found in $SPRITES_DIR"
        exit 1
    fi

    for i in "${!characters[@]}"; do
        character_name=$(basename "${characters[$i]}")
        echo "$((i+1)). $character_name"
    done

    while true; do
        read -p "Select character number (1-${#characters[@]}): " choice
        if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le ${#characters[@]} ]; then
            selected_character="${characters[$((choice-1))]}"
            character_name=$(basename "$selected_character")
            echo "Selected character: $character_name"
            break
        else
            echo "Invalid selection. Please enter a number between 1 and ${#characters[@]}"
        fi
    done
}

# Select character
select_character

# Define output file with character name
OUTPUT="${character_name}_sprite_sheet.png"

# Create a temporary file list
TEMP_FILELIST=$(mktemp)

# Check if selected character directory exists
if [ ! -d "$selected_character" ]; then
    echo "Error: Character directory '$selected_character' not found!"
    rm "$TEMP_FILELIST"
    exit 1
fi

# Change to character directory
cd "$selected_character"

# Check which animation folders exist
FOLDERS=()
for folder in "${ALL_FOLDERS[@]}"; do
    if [ -d "$folder" ]; then
        FOLDERS+=("$folder")
        echo "Found animation: $folder"
    else
        echo "Warning: Animation folder '$folder' not found in $character_name, skipping..."
    fi
done

# Ensure at least one animation folder exists
if [ ${#FOLDERS[@]} -eq 0 ]; then
    echo "Error: No animation folders found in $character_name!"
    cd ..
    rm "$TEMP_FILELIST"
    exit 1
fi

# Calculate tile dimensions: 9 columns (frames) x (4 views * number of animations) rows
ROWS=$((4 * ${#FOLDERS[@]}))
TILE="9x${ROWS}"
echo "Generating sprite sheet with ${#FOLDERS[@]} animation(s): ${FOLDERS[*]}"
echo "Tile configuration: $TILE"

# Populate the file list in the correct order: 4 views per animation, for all available animations
for folder in "${FOLDERS[@]}"; do
    for i in "${!VIEWS[@]}"; do
        view="${VIEWS[$i]}"
        read start end <<< "${FRAME_RANGES[$i]}"
        # Generate frame numbers with proper padding
        for frame in $(seq -f "%04g" $start $end); do
            file="$folder/$frame.png"
            if [ -f "$file" ]; then
                echo "$file" >> "$TEMP_FILELIST"
            else
                echo "Error: File $file not found!"
                cd ..
                rm "$TEMP_FILELIST"
                exit 1
            fi
        done
    done
done

# Create the sprite sheet using ImageMagick montage
magick montage -background none -tile "$TILE" -geometry "$FRAME_SIZE"+0+0 @"$TEMP_FILELIST" "../$OUTPUT"

# Check if the sprite sheet was created successfully
if [ -f "../$OUTPUT" ]; then
    echo "Sprite sheet created: $OUTPUT"
else
    echo "Error: Failed to create sprite sheet!"
    cd ..
    rm "$TEMP_FILELIST"
    exit 1
fi

# Clean up
cd ..
rm "$TEMP_FILELIST"
