---
date: '2026-01-19T14:50:09+09:00'
draft: false
title: 'Know Your Enemy 2.5: Pallas Programming Model'
cover:
  image: ""
  # can also paste direct link from external site
  # ex. https://i.ibb.co/K0HVPBd/paper-mod-profilemode.png
  alt: "Pallas Programming Model"
  caption: ""
  relative: true # To use relative path for cover image, used in hugo Page-bundles
authors: ["Donghyeon Choi"] # must match with content/authors
tags: ["Pallas", "TPU", "Google", "Ironwood", "Kernel", "Custom Kernel", "Programming Model"]
categories: ["AI Hardware", "Computer Architecture"]
series: ["Know Your Enemy, Know Yourself"]
summary: "Learn about Pallas programming model that enables writing custom kernels on TPU."
comments: true
description: "Building on the TPU architecture explored in part 2, we examine Pallas, a programming model that enables writing custom kernels on TPU."
keywords: [
  "Pallas", "TPU", "Google", "Ironwood", "Custom Kernel", "Kernel Programming",
  "AI Hardware", "Programming Model", "TPU Optimization"
]
---

# Know Your Enemy 2.5: Pallas Programming Model

[Know Your Enemy 1: GPU History and Fundamentals](https://hyper-accel.github.io/en/posts/how-gpu-works/)  
[Know Your Enemy 2: The Rise of TPU](https://hyper-accel.github.io/en/posts/tpu-deep-dive/)

> **Know Your Enemy, Know Yourself (知彼知己 百戰不殆)**  
> If you know your enemy and know yourself, you need not fear the result of a hundred battles.  
> This series aims to deeply understand competitors' hardware for AI accelerator design.  
> Part 2.5 covers **Pallas**, a programming model that enables writing custom kernels on TPU.

In part 2, we explored TPU's hardware architecture and software stack. We discussed how the XLA compiler optimizes operations and its limitations. At the end, we previewed that the next article (part 3) would introduce Groq's LPU.

However, to truly understand TPU, hardware and software stack alone are not enough. Especially in the latest TPU generation, Ironwood, the **Pallas** programming model plays a crucial role in performance optimization. Pallas is a tool that allows writing custom kernels on TPU, similar to CUDA or Triton. It enables direct control over hardware details while remaining relatively easy to use in a Python environment.

As mentioned in part 2 regarding the limitations of the XLA compiler, automatic compilers often struggle to optimize cutting-edge algorithms. Pallas is the kernel language Google created to overcome these limitations. When announced alongside Ironwood, it was emphasized with the slogan "Extreme performance: Custom kernels via Pallas," highlighting its important role in maximizing TPU performance.

Therefore, before diving into Groq's LPU in part 3, we first examine the Pallas programming model in part 2.5 to complete our understanding of TPU. In this article, we'll explore what Pallas is, why it's needed, and how it enhances TPU performance.

---

## Background: TPU Architecture and Why Pallas is Needed

To understand Pallas, we first need to understand how TPU differs from CPUs or GPUs. This difference is exactly why Pallas is needed.

### Traditional Architecture vs TPU's Systolic Array

Traditional CPU or GPU architectures repeatedly fetch and store data from SRAM to register files for each operation. This approach causes massive **memory bandwidth waste** in operations like matrix multiplication that repeatedly use the same data.

TPU solves this by adopting a structure where **once-loaded data flows between compute units and is continuously calculated**. This is the Systolic Array structure.

### TPU's Data Flow

Operations within TPU follow this flow:

1. **Weight Supply**: Weight data stored in DRAM is loaded into MXU (Matrix Multiply Unit) through Weight FIFO.
2. **Activation Supply**: Input data stored in Unified Buffer (UB) is delivered to MXU.
3. **Matrix Operations**: Multiplication and accumulation (Multiply-Accumulate) operations occur simultaneously through the Systolic Array structure inside MXU.
4. **Post-processing Pipeline**: MXU output values pass through Accumulator, Activation Unit (ReLU, etc.), and Normalize/Pool Unit sequentially to perform additional operations required by AI models.
5. **Result Storage**: Final output after all operation flows returns to Unified Buffer and is stored.

### Key Difference from GPU: Change in Execution Unit

This structural difference creates a very significant difference from a programming model perspective.

- **GPU (SIMT)**: Numerous threads perform calculations independently, managed in groups of 32 threads called Warps. It features fine-grained parallel processing focused on individual data.
- **TPU (Tensor-centric, SPMD)**: A single data load completes the entire operation sequence. That is, rather than individual threads, **'the entire program for one tensor (or tile)' is considered as one minimum execution unit**.

> **Why Pallas?** Pallas is a language designed to abstract these TPU hardware characteristics (direct Unified Buffer control, MXU scheduling, etc.) while allowing developers to directly optimize this 'tensor-level flow'.

TPU has evolved through generations, strengthening vector operation units and developing scale-up technologies for large-scale models. The latest architecture, Ironwood, has become a 'monster compute unit' with a massive package adopting chiplet structure and mounting **four 256x256 Systolic Arrays (MXU)**. However, despite the dramatic increase in hardware scale, the core design principle of **'performing as many operations as possible through a single data load'** remains unchanged.

### Why Pallas is Needed

When we discussed the XLA compiler in part 2, we mentioned that while XLA is a powerful optimization compiler, it has limitations. When new operation algorithms emerge, it's difficult for manually created custom kernels to match performance until the compiler is updated to a version that can optimize them.

For example, cutting-edge algorithms like Flash Attention or MoE (Mixture of Experts) often have complex memory access patterns or high data dependencies, making them difficult for automatic compilers to optimize. In such cases, developers need to directly understand the memory hierarchy and finely control how to tile data, when to move data between memory levels, and so on.

On GPUs, this problem was solved with CUDA or Triton. CUDA allows direct hardware control but has a high barrier to entry, while Triton has a higher level of abstraction, making it relatively easier to use. However, both only work on GPUs.

What about TPU? Google began providing **Pallas** as an experimental extension of JAX around 2023. Pallas shares a similar philosophy with Triton but differs significantly in that it supports both GPUs and TPUs.

---

## What is Pallas?

Pallas is a kernel language that enables writing custom kernels within the JAX ecosystem. It works on both GPUs and TPUs, allowing direct control over hardware memory hierarchy, data tiling, and block-level parallelism.

### Basic Concepts

Pallas's core idea is simple. It allows developers to control operations that are difficult for high-level automated compilers to handle, at a level closer to hardware. However, unlike CUDA, it doesn't go completely low-level but is abstracted to be relatively easy to use in a Python environment.

### Key Components

Pallas consists of several core concepts:

**1. Grid and Program ID: Parallel Execution Abstraction**

Pallas models execution units through a **Grid** abstraction. Grid has different meanings depending on hardware but provides a unified interface.

```python
def kernel(o_ref):
    i = pl.program_id(0)  # Current program's ID
    o_ref[i] = i

# Grid size specification: (8,) = 8 parallel programs
result = pl.pallas_call(
    kernel,
    out_shape=jax.ShapeDtypeStruct((8,), jnp.int32),
    grid=(8,),  # 8 parallel instances
)()
```

#### Grid Semantics: GPU vs TPU

In Pallas, **Grid** is a collection of execution units that divide the entire work, but how hardware processes this Grid has fundamental differences depending on the architecture.

**Grid on GPU**: In GPU backends (Triton/Mosaic), Grid assumes **fully parallel execution** by hardware schedulers. Each Grid item is mapped to one **Thread Block** and executed independently on individual SMs (Streaming Multiprocessors). Since hardware schedules threads non-deterministically, execution order between Grids is not guaranteed. Therefore, `BlockSpec`'s `index_map` design must strictly manage **race conditions** to prevent different programs from writing to the same HBM location.

**Grid on TPU**: In TPU backends, Grid is a model that combines parallelism between multiple cores and **sequential pipelining** within a single core. TPU is a very wide SIMD machine, but can be coded like a **single-threaded processor** from a software perspective. The control unit (TCS) provides an intuitive flow that controls entire operations by looping. There are Parallel dimensions that distribute work when multiple TensorCores exist and execute **physically simultaneously**, and Sequential dimensions that guarantee **serial execution** within a single TensorCore. Sequential dimensions are not just for slow execution, but are used as a strategic means to **hide memory latency** by overlapping (Overlap) current operations and next data loading through **Semaphores**.

**2. BlockSpec: Memory Layout Abstraction**

Pallas abstracts the process of dividing massive data into chunks that hardware can digest through **BlockSpec**. This goes beyond simply cutting data and defines **data transfer protocols between HBM (Remote) and SRAM (Local)**.

BlockSpec components:

- `block_shape`: The size of data that each program instance will place on the Local Memory (SRAM) workbench. Designing this not to exceed hardware SRAM capacity is key to performance optimization.
- `index_map` **function**: Takes `grid` indices (i, j) as input and returns the block start position on HBM. This function is analyzed at compile time and converted to hardware DMA (Direct Memory Access) address calculation logic.
- `memory_space`: Specifies the physical container where fragmented data will reside. If not specified, it's allocated to the default space (`pl.SRAM`) according to backend settings.

**3. Ref: Memory Reference Abstraction**

Pallas abstracts complex hardware memory address systems through **Ref** objects. This goes beyond simple pointers to data and provides a **logical view of specific data blocks on SRAM (Local Memory)**.

Ref's key features:

- **Local Memory Reference**: `Ref` points to data that has already been loaded or will be loaded on **SRAM (TPU's VMEM/SMEM, GPU's Shared Memory)**, the fastest workbench in hardware, not HBM.
- **Dereferencing**: When using brackets like `x_ref[...]`, actual data loading from **SRAM → Register File** occurs, converting it to a 'Value'.
- **Hardware Abstraction**: Even using the same `Ref` interface, it automatically converts to TPU's Vector/Scalar memory or GPU's Shared Memory access depending on the backend.

**4. Memory Hierarchy Control**

Pallas provides memory models that share the same big picture but differ in details for TPU and GPU. Let's first look at the overall structure that's abstracted and provided in common.

The structure abstracted and provided in both:

- **Remote Memory (HBM)**: Memory space mainly specified through `pl.ANY`.
- **Multiple "Core" structure**: Independent compute units for parallel processing of grids.
  - **Local Memory (SRAM or Cache)**: SRAM memory located inside cores, slightly faster. It's recommended to separate READ and WRITE variables to maintain consistency with HBM data.
  - **Register Files in Execution Units**: Small memory that can directly exchange data with compute units inside cores.

Generally, Local Memory takes 10x the latency of Register File, and Remote Memory takes another 10x the latency of Local Memory. However, in TPU v7 Ironwood adopting chiplet structure, since one chip contains HBM, Remote Memory communication can be 2~5x faster than the previous 10x.

#### TPU Memory Hierarchy Structure

Looking at TPU's memory hierarchy model:

- **Local Memory** consists of Vector Memory and Scalar Memory:
  - **Vector Memory (VMEM)**: Memory that stores data for Vector and Matrix related operations. Accessible from Vector/Matrix Units (VPU/MXU/XLU) within the same tensor core.
  - **Scalar Memory (SMEM)**: Memory that stores data for scalar operations for logic flow (loops, conditions, etc.). Accessible from Scalar Unit (TCS) within the same tensor core. Data stored on SMEM can also be directly used in vector operations through high-level commands generated by TCS.

- Each VMEM and SMEM has separate READ/WRITE areas to ensure data sync with HBM. This is because modifying data read as READ without write-back can cause data inconsistency with HBM.

- When calling kernels, data is loaded from Remote Memory to Local Memory according to the specified BlockSpec. At this time, corresponding data is automatically fetched according to the set Grid number.

- When calling Ref data inside kernels, data is fetched from Local Memory to Register File for operations. During Local Memory ↔ Register File movement and operation, data loading from Remote Memory → Local Memory for the next Grid automatically overlaps. This can hide memory latency significantly.

- Writing result data to the output Ref data set in the kernel writes back to Local Memory, and when all programs for that grid finish, the output Ref data is written back to Remote Memory.

#### GPU Memory Hierarchy Structure

Looking at GPU's hardware model:

- **Local Memory is Shared Memory (SMEM)**: Each SM (Streaming Multiprocessor) has independent Shared Memory/L1 Cache space. Unlike TPU, it's a unified workspace without Scalar/Vector distinction, where numerous threads access this space simultaneously for parallel operations.

- **Data Movement and Pipelining**: Unlike existing methods that rely only on hardware scheduling, Pallas GPU explicitly **overlaps HBM (Remote) → SMEM (Local) data loading and TensorCore operations**. Through `plgpu.emit_pipeline`, etc., while compute units process current data, data for the next grid is prefetched asynchronously to hide memory latency.

- **Ref Variable Entity and Hardware Mapping**: Ref variables inside kernels are addresses of data chunks that have already been loaded or will be loaded on Local Memory (SMEM), not HBM. Through `memory_space=plgpu.GPUMemorySpace.GMEM` settings, HBM (Remote) space is explicitly specified and can be directly controlled with `copy_gmem_to_smem`.

**5. Memory Pipelining & Semaphore**

Data movement between Remote Memory and Local Memory in TPU architecture causes latency of hundreds of cycles. To overcome this, Pallas supports pipelining using hardware-level semaphores.

**Hardware Role of Semaphore**: Acts as a **traffic light** between data movement (DMA) and compute units. It hardware-checks "Has data loading completed?" or "Has computation finished and space become available?" to ensure two tasks safely overlap execution.

**Double Buffering**: Allocates two buffers (e.g., Buffer 0, Buffer 1) within Local Memory. **While VPU computes Buffer 0, DMA prefetches next data from HBM to Buffer 1**. As this process repeats, memory latency is completely hidden behind computation time.

Semaphore is a **synchronization device** that coordinates two different engines—data transfer (DMA) and computation (VPU/TCS)—so they don't collide. Through `pltpu.semaphore`, it prevents problems like 'trying to read before data arrives (Read-before-ready)' or 'overwriting with new data while still computing (Write-over-active)' at the hardware level, realizing **Auto-Overlap**.

**3. Backend Lowering**

Kernels written in Pallas are eventually converted to hardware code. On GPUs, they are lowered through Triton or Mosaic GPU backends, while on TPUs, they are lowered through the Mosaic compiler to MLIR form and finally converted to hardware code.

During this process, operator fusion, tiling automation, and overlapping of data transfer and computation are optimized. The high-level code written by developers is transformed into hardware-optimized code.

**4. Compatibility with JAX Transforms**

Pallas kernels are compatible with JAX transforms like `jit`, `vmap`, and `grad`. This is a major advantage, as you can still utilize features like automatic differentiation, mapping, and compilation while writing high-performance kernels.

---

## CUDA vs Pallas: Programming Model Comparison

In part 1, we explored the CUDA programming model. Now let's compare CUDA and Pallas to clearly understand their characteristics and differences.

### Abstraction Level and Approach

**CUDA**: A very low-level programming model close to hardware. Through a clear hierarchical structure of Thread, Warp, Block, and Grid, it allows direct control over hardware details. Developers must directly calculate thread IDs and carefully design memory access patterns.

**Pallas**: Provides one level higher abstraction than CUDA. Working in a Python environment, you only need to define how to divide data through Grid and BlockSpec, and the hardware automatically handles memory movement and scheduling. Developers can focus on "what data to place where."

### Difference in Execution Units

**CUDA's Execution Units**:
- **Thread**: The minimum unit of parallel processing. Each thread has a unique thread ID and executes independently.
- **Warp**: A hardware execution unit bundling 32 consecutive threads. Executes the same instruction simultaneously.
- **Thread Block**: A group bundling up to 1024 threads. Shares Shared Memory and can synchronize with `__syncthreads()`.
- **Grid**: The entire unit of kernel execution. A collection of all thread blocks.

**Pallas's Execution Units**:
- **Grid**: An abstraction specifying the iteration space for parallel execution. A `(4, 5)` grid means 20 work units.
- **BlockSpec**: Defines how to tile data and which memory space to place it in. The hardware automatically handles data movement.
- **Ref**: A logical view of data blocks on Local Memory (SRAM). Accessing with `x_ref[...]` automatically loads to Register File.

### Memory Hierarchy Control

**CUDA**:
- Developers must explicitly specify memory spaces: `__global__`, `__shared__`, `__device__`, etc.
- Must directly manage Shared Memory allocation and usage.
- Requires deep understanding of hardware structure to optimize memory access patterns.

**Pallas**:
- Specifies memory space through `memory_space` parameter, but hardware automatically optimizes.
- Automatically maps to VMEM/SMEM on TPU and Shared Memory on GPU.
- Can declaratively define data tiling and memory movement through BlockSpec.

### Hardware Target and Portability

**CUDA**:
- NVIDIA GPU exclusive.
- Optimization methods may vary depending on GPU architecture (e.g., Hopper, Blackwell).
- However, the CUDA ecosystem is very mature with rich tools and libraries.

**Pallas**:
- Supports both GPU and TPU.
- Flexibility to run the same kernel definition on multiple hardware platforms.
- However, still in experimental stage, so some features may be limited.

### Development Convenience and Learning Curve

**CUDA**:
- Low-level language based on C/C++.
- Must deeply understand hardware structure to achieve optimal performance.
- Steep learning curve but provides complete control.

**Pallas**:
- Python-based, naturally integrated with the JAX ecosystem.
- Compatible with JAX transforms like `jit`, `vmap`, `grad`.
- Relatively easy to start, but still requires hardware understanding for optimal performance.

### Practical Usage Example Comparison

Comparing simple vector addition implemented in CUDA and Pallas clearly shows the difference.

**CUDA Approach**:
```cuda
__global__ void vector_add(float *A, float *B, float *C, int N) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < N) {
        C[idx] = A[idx] + B[idx];
    }
}
```

**Pallas Approach**:
```python
def vector_add_kernel(a_ref, b_ref, c_ref):
    c_ref[...] = a_ref[...] + b_ref[...]

result = pl.pallas_call(
    vector_add_kernel,
    out_shape=jax.ShapeDtypeStruct((N,), dtype),
    grid=(N,),
)(a, b)
```

In CUDA, you must directly calculate thread IDs and perform boundary checks, while Pallas abstracts at the data block level.

### When to Use What?

**Choose CUDA when**:
- Maximum performance is needed on NVIDIA GPUs
- Need fine-grained control over complex custom algorithms
- Want to leverage the rich tools and libraries of the CUDA ecosystem

**Choose Pallas when**:
- Need to support both GPU and TPU
- Want a workflow integrated with the JAX ecosystem
- Want to quickly prototype in a Python environment
- Want to utilize automatic differentiation or other JAX transforms

---

## How Pallas is Used on TPU

### Ironwood and Pallas

In the latest TPU generation, Ironwood, Pallas is emphasized with the slogan "Extreme performance: Custom kernels via Pallas." In the Ironwood stack, developers can directly specify strategies for memory tiling, data movement, and MXU utilization through Pallas definitions, and the Mosaic compiler lowers this to TPU code.

Through this combination, tiling strategies like input stationary, weight stationary, and output stationary, as well as distributed processing at stride and batch levels, can be efficiently designed. Additionally, it enables designs that minimize scheduling bottlenecks in the entire pipeline by overlapping HBM ↔ on-chip memory data transfer and MXU computation simultaneously.

### Real-World Use Cases

Pallas is primarily used in the following cases:

- **Complex Attention Mechanisms**: Cutting-edge attention algorithms like Flash Attention have complex memory access patterns that are difficult for automatic compilers to optimize. Using Pallas, you can efficiently implement them by directly controlling the memory hierarchy.

- **MoE (Mixture of Experts)**: In MoE models, expert routing logic has high data dependencies, making it difficult to optimize at compile time. Using Pallas, dynamic routing can be handled efficiently.

- **Sparse Operations**: For sparse matrix operations or ragged tensors, padding may change dynamically or irregular memory access may be required. Pallas is also useful in these cases.

---

## Notable Technical Benefits and Considerations

### Benefits

**Maximum Performance Potential**: By explicitly adjusting memory access patterns and tiling strategies that are difficult for automatic compilers to discover, very fast kernels can be created.

**Hardware Abstraction Maintained**: You still work within the Python language and JAX ecosystem, and can use features like `jit` and `grad` as-is.

**Multi-Backend Support**: Supports both GPUs and TPUs, providing flexibility to run the same kernel definition on multiple hardware platforms.

### Considerations

**Experimental API**: Pallas is still in an experimental stage with frequent changes. Breaking changes may occur with version updates, and some features may be incomplete or throw "unimplemented" errors.

**Learning Curve**: You need to understand details like memory hierarchy, tiling, and data transfer. Poorly designed kernels can actually cause performance loss.

**Need for Debugging and Optimization Tools**: Optimization is difficult without profiling, metrics, and system-level observation tools. It's not yet as mature as GPU's CUDA tools.

---

## Conclusion

As the saying goes, "Know your enemy, know yourself"—by understanding and responding to hardware (especially TPU) through Pallas, it can become a weapon in the performance war.

Pallas is an important tool that bridges the gap between automated compilation stacks and research or production performance. The combination of Ironwood and the Mosaic compiler enables more effective processing of complex operations required by new generations of models on TPU.

As more operators with non-standard memory access and high data dependencies—like attention, MoE, and sparse operations—emerge, the importance of such custom kernel capabilities will only grow.

In the next article, we'll actually write a simple kernel using Pallas and compare performance, experiencing "know your enemy" in practice.

---

## Reference

- [Pallas Documentation](https://docs.jax.dev/en/latest/pallas/index.html)
- [Pallas TPU Details](https://docs.jax.dev/en/latest/pallas/tpu/details.html)
- [Inside the Ironwood TPU codesigned AI stack](https://cloud.google.com/blog/products/compute/inside-the-ironwood-tpu-codesigned-ai-stack)
- [PyTorch/XLA 2.4 improves Pallas and adds eager mode](https://cloud.google.com/blog/products/ai-machine-learning/pytorch-xla-2-4-improves-pallas-and-adds-eager-mode)
- [TPU Architecture (qsysarch.com)](https://qsysarch.com/posts/tpu-architecture/)
- [TPU v7 Documentation](https://docs.cloud.google.com/tpu/docs/tpu7x?hl=ko)

---

## P.S. HyperAccel is Hiring!

"Know your enemy, know yourself," but to win every battle, we need many talented people!

If you're interested in the technologies we work with, please apply at [HyperAccel Career](https://hyperaccel.career.greetinghr.com/ko/guide)!

HyperAccel has many excellent and brilliant engineers. We're waiting for your application.
