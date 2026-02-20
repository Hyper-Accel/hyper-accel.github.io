---
name: Well-Writing
description: This skill should be used when reviewing and editing markdown blog posts for the HyperAccel technical blog. It provides style guide compliance checking and readability improvements.
---

# Well-Writing

This skill helps review and edit markdown blog posts for the HyperAccel technical blog by ensuring style guide compliance and improving readability.

## When to Use This Skill

Use this skill when:
- Reviewing or editing markdown blog posts (`.md` files)
- Checking style guide compliance
- Improving readability and technical writing quality
- Validating frontmatter and metadata

## Workflow

### 1. Load Style Guide Reference

To review a blog post, first load the style guide:
- Load `references/styleguide.md` for detailed rules and examples
- Load `references/checklist.md` for quick reference during review

The style guide contains:
- Critical Issues (Must Fix): Bold rendering, acronym usage, capitalization
- Content Quality (High Priority): Readability, technical writing
- Markdown Formatting (Medium Priority): Headings, code blocks, images, lists
- Frontmatter and Metadata: Required fields and format

### 2. Review Critical Issues

Check for these critical issues first (must fix before merging):

**Bold Rendering**:
- Search for pattern: `\*\*[^*]+\*\*[가-힣]` (bold text immediately followed by Korean)
- Ensure space between closing `**` and Korean text
- Example: `**GPU** 는` (correct) vs `**GPU**는` (incorrect)

**Acronym Usage**:
- Verify all acronyms are introduced with full terms first: `**FullTerm(Acronym)**`
- Check that acronyms in title/summary are introduced in first paragraph
- Common acronyms: GPU, TPU, SM, CUDA, HBM, SMEM, VMEM, MXU, VPU, TCS, XLA, JAX, Pallas, Triton

**Capitalization**:
- Ensure consistent capitalization throughout
- Acronyms uppercase: GPU, TPU, SM
- Common nouns lowercase: loop, thread, warp, core
- Brand names correct: NVIDIA, Google, TensorFlow, PyTorch

### 3. Review Content Quality

Check readability and technical writing:

**Readability**:
- Sentences should be within 50 characters (flexible for technical terms)
- Paragraphs should be within 10 sentences or 200 characters
- Break complex explanations into multiple sentences
- Use blank lines to separate distinct ideas

**Technical Writing**:
- Technical terms explained when first introduced
- Code examples have comments or explanations
- Images have meaningful alt text
- Content has logical structure with clear sections

### 4. Review Markdown Formatting

Check formatting consistency:

- Headings: Proper hierarchy (H2 → H3, maximum H3 level, no H4 or deeper)
- Code blocks: All have language tags (` ```python`, ` ```bash`, etc.)
- Images: Descriptive alt text, meaningful file names
- Links: Descriptive link text
- Lists: Consistent formatting (`-` for unordered)
- Frontmatter: All required fields present and correct

### 5. Images from Confluence

When a blog post references images from Confluence:

- **Images must be downloaded manually** from the Confluence page
- The agent should inform the user that images need to be manually downloaded
- Provide guidance on where to find the images:
  1. Identify the corresponding Confluence page (if the page ID or URL is known)
  2. Open the Confluence page in a browser
  3. Right-click on each image and select "Save image as..." or "Download"
  4. Save images to the appropriate `images/` directory relative to the markdown file
  5. **Rename images with sequential numbers**: Images should be named with a two-digit prefix (e.g., `01-`, `02-`, `03-`) followed by a descriptive name
     - Format: `{number}-{descriptive-name}.{ext}`
     - Example: `01-tpuv1-arch.png`, `02-pallas-lowering.png`, `03-tpuv7-arch.png`
     - Numbers should reflect the order in which images appear in the blog post
  6. Ensure the saved file names match the image references in the markdown file

**Note**: Automatic image download from Confluence is not supported. All images must be manually downloaded and placed in the correct directory.

### 6. Verify and Insert Images in Blog Posts

When reviewing a blog post, the agent should verify that images are properly referenced and placed:

1. **Check the images directory**:
   - Locate the `images/` directory relative to the markdown file (typically `content/posts/{post-name}/images/`)
   - List all image files in the directory
   - Note the file names and formats (`.png`, `.jpg`, `.webp`, etc.)
   - **Verify naming convention**: All image files should follow the format `{number}-{descriptive-name}.{ext}` where:
     - `{number}` is a two-digit sequential number (01, 02, 03, etc.)
     - `{descriptive-name}` is a lowercase, hyphen-separated descriptive name
     - Example: `01-tpuv1-arch.png`, `02-pallas-lowering.png`, `03-tpuv7-arch.png`

2. **Read and analyze the markdown file**:
   - Search for all image references using the pattern: `!\[.*?\]\(images/.*?\)`
   - Extract:
     - Image file paths (e.g., `images/tpu-v1-architecture.png`)
     - Alt text (the text between `![` and `]`)
     - Caption text (if present in alt text or nearby context)

3. **Match images with references**:
   - For each image file in the directory, check if it's referenced in the markdown
   - For each image reference in the markdown, verify the file exists
   - Identify:
     - **Orphaned images**: Files in directory but not referenced in markdown
     - **Missing images**: References in markdown but files don't exist
     - **Mismatched names**: References that don't match actual file names

4. **Verify image placement**:
   - Check that images are placed in logical positions:
     - **Images should be placed BEFORE the content they illustrate** (recommended)
     - This allows readers to see the visual context before reading the explanation
     - Images should appear near the text that describes them
     - Images should not interrupt the flow of reading
   - Verify image context:
     - The surrounding text should mention or describe what the image shows
     - Images should support the narrative, not just be decorative

5. **Check image metadata**:
   - **Alt text**: Should be descriptive and meaningful (not just the filename)
     - Good: `![TPU v1 아키텍처 다이어그램](images/01-tpuv1-arch.png)`
     - Bad: `![image](images/01-tpuv1-arch.png)` or `![01-tpuv1-arch.png](images/01-tpuv1-arch.png)`
   - **File names**: Must follow the sequential numbering format `{number}-{descriptive-name}.{ext}`
     - Numbers should be two digits (01, 02, 03, ..., 10, 11, etc.)
     - Numbers should reflect the order images appear in the blog post
     - Descriptive name should be lowercase with hyphens (e.g., `tpuv1-arch`, `pallas-lowering`)
   - **Image format**: Prefer `.webp` for smaller file sizes, but `.png` is acceptable for diagrams

6. **Suggest improvements**:
   - If images are missing, suggest adding them with appropriate alt text and sequential numbering
   - If images are in wrong locations, suggest moving them to better positions
   - If alt text is missing or poor, suggest improvements
   - If file names don't follow the numbering convention, suggest renaming:
     - Determine the correct order based on where images appear in the markdown
     - Rename files to follow `{number}-{descriptive-name}.{ext}` format
     - Update all references in the markdown file to match the new names
   - If file names don't match references, suggest renaming files or updating references
   - If orphaned images exist, ask if they should be removed or referenced
   - If sequential numbers are missing or incorrect, suggest renumbering all images in order

7. **When inserting images**:
   - **Place images BEFORE the content they illustrate** (recommended)
   - This allows readers to see the visual context before reading the explanation
   - Use descriptive alt text that explains what the image shows
   - Consider the reading flow - images should enhance understanding, not interrupt it
   - **File naming**: Before inserting, ensure the image file follows the sequential numbering format:
     - Determine the correct sequence number based on where this image appears in the post
     - If it's the first image, use `01-`, second image use `02-`, etc.
     - Format: `{number}-{descriptive-name}.{ext}` (e.g., `01-tpuv1-arch.png`)
   - Format: `![Descriptive alt text](images/{number}-{descriptive-name}.{ext})`
   - If the image needs a caption, include it in the alt text or add a caption below
   - **Renaming existing images**: If inserting an image requires renumbering existing ones:
     - Rename all affected image files
     - Update all references in the markdown file to match the new names
     - Maintain sequential order throughout the post

**Example workflow**:
```
1. Read markdown file: content/posts/pallas-programming-model/index.md
2. Check images directory: content/posts/pallas-programming-model/images/
3. Find all image references in markdown (in order of appearance)
4. Verify all image files follow naming convention: {number}-{descriptive-name}.{ext}
5. Match files with references
6. Verify each image is in the right place contextually
7. Check alt text quality
8. Verify sequential numbering matches the order images appear in the post
9. Report any issues and suggest fixes (renaming, renumbering, etc.)
```

**Image naming examples**:
- First image in post: `01-tpuv1-arch.png`
- Second image in post: `02-pallas-lowering.png`
- Third image in post: `03-tpuv7-arch.png`
- Tenth image in post: `10-common-hw-model.png`

## Providing Feedback

When reviewing a post:

1. **Prioritize by severity**:
   - Critical: Must fix (rendering issues, major readability problems)
   - High: Significantly impacts readability or understanding
   - Medium: Formatting or consistency issues

2. **Be specific**:
   - Point to exact locations (line numbers if possible)
   - Provide before/after examples
   - Reference specific rules from `references/styleguide.md`

3. **Suggest fixes**:
   - Show correct format
   - Explain why the fix is needed
   - Reference relevant sections of the style guide

4. **Use the checklist**:
   - Refer to `references/checklist.md` for quick verification
   - Check off items as you review
   - Focus on critical and high-priority items first

## Common Patterns

Based on existing blog posts:

- **Series posts**: Use `series: ["시리즈 이름"]` in frontmatter
- **Code languages**: Python, CUDA, Bash, C, Go, F# are commonly used
- **Image formats**: `.webp`, `.png`, `.jpg` are used
- **Technical terms**: GPU, TPU, SM, CUDA, HBM, Systolic Array, Tensor Core, etc.

## Notes

- **Context matters**: Some rules may be flexible for technical content (e.g., longer sentences for complex explanations)
- **Consistency first**: If a pattern is used consistently throughout a post, it may be acceptable even if not ideal
- **Be constructive**: When pointing out issues, suggest specific fixes and explain the reasoning
