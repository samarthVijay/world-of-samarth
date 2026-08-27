import { asset } from "../constants";
import type { WhiteboardConfig } from "../types";

export const WHITEBOARD_CONFIG: WhiteboardConfig[] = [
  {
    id: "board1",
    title: "Projects",
    sections: [
      {
        title: "Single-Byte I2C Master Core | SystemVerilog, UVM, Questa",
        body: `<p><b>Architecture:</b> Designed I2C Master controller FSM for START/STOP, address, read/write, and ACK/NACK phases.</p>
               <p><b>Hardware:</b> Implemented SDA tri-state behavior and SCL generation via clock division meeting protocol timing requirements.</p>
               <p><b>Verification:</b> Built a UVM verification environment with driver, monitor, scoreboard, and functional coverage. Verified design using directed and randomized stimulus, achieving high coverage by validating edge cases.</p>`,
      },
      {
        title: "Jetbot Autonomous Parking | PyTorch, TensorFlow, CUDA, OpenCV",
        url: "https://github.com/samarthVijay/Jetbot-Autonomous-Parking-and-Self-Driving",
        body: `<p><b>Overview:</b> Developed and validated autonomous vehicle with PyTorch and Machine Learning (ML) libraries.</p>
               <p><b>Perception & Control:</b> Designed a Parking State Machine with custom PCA9685/TB6612FNG motor drivers for validation.</p>
               <p><b>CUDA Optimization:</b> Optimized inference processing with zero-copy CUDA image driver using GStreamer to map CSI frames directly to CUDA memory tensors, bypassing CPU pre-processing entirely.</p>
               <p><b>Pipeline:</b> Built end-to-end ML pipelines by collecting data and training multi-class convolutional neural network (CNN) with transfer learning for object detection, collision avoidance, road following, and parking.</p>`,
      },
      {
        title: "FPGA Image Codec Accelerator | SystemVerilog, RTL, ModelSim, Quartus",
        body: `<p><b>Architecture:</b> Built end-to-end RTL hardware accelerator converting variable input bit streams to RGB frames for display on FPGA.</p>
               <p><b>DSP & Compression:</b> Implemented lossless decoding, Inverse DCT matrix multiplication, and YUV/RGB color space conversion with 10-tap chroma upsampling under an 85% average multiplier utilization constraint.</p>
               <p><b>Memory & Interface:</b> Designed FSM managing decode sequencing and block addressing between 16-bit external SRAM and 32-bit internal DRAM, with top-level UART/VGA integration.</p>
               <p><b>Verification:</b> Performed UVM test bench verification with ModelSim, Python image data comparisons, and FPGA hardware validation.</p>`,
      },
      {
        title: "LIDAR-based Object Modeling | C/C++, Python, MATLAB, MSP432",
        url: "https://github.com/samarthVijay/Embedded-LIDAR-Project",
        body: `<p><b>Overview:</b> Developed a low-cost alternative scanning LIDAR system in C/C++ on an MSP microcontroller.</p>
               <p><b>Hardware:</b> Synchronized stepper motor and Time-of-Flight (TOF) sensor peripherals interfaced over I²C.</p>
               <p><b>Processing:</b> Used UART serial from system to PC, and MATLAB data processing scripts for real-time spatial 3D visualizations.</p>`,
      },
      {
        title: "Minecraft-inspired Web World (this site)",
        body: `<p>Interactive portfolio world built with <b>React + TypeScript + @react-three/fiber (Three.js)</b> for WebGL rendering, posters/boards as billboards, pointer-lock navigation, and interactive 3D modals.</p>
               <p><b>Under the hood:</b> Tailwind UI, shadcn components, modular scene graph, asset configs, and GitHub CI/CD.</p>`,
      },
    ],
    images: [
      asset("images/imagejetbot1.jpeg"),
      asset("images/imagejetbot3.gif"),
      asset("images/imagejetbot2.jpeg"),
      asset("images/imagelidar1.jpeg"),
      asset("images/imagesnake1.jpg"),
    ],
    image: "https://via.placeholder.com/400x300/4ade80/ffffff?text=Projects",
  },
  {
    id: "board2",
    title: "Experience",
    sections: [
      {
        title: "Geotab Inc. — Firmware Developer Intern (May 2026 – Present)",
        body: `<p>Oakville, ON</p>
               <ul>
                 <li>Extended parked battery life from hours to weeks, and reduced parked current draw by <b>99%</b> with low-power management firmware for next-gen Go Focus 2 cameras.</li>
                 <li>Implemented peripheral drivers + interfaces in <b>Rust/C</b> (IMU, RTC, USB HID) and a PMIC state machine.</li>
                 <li>Built low-power features such as movement/scheduled/ignition wake-up, wake reason logging, and wake locking.</li>
                 <li>Designed cross-processor System Time Synchronization across MCU firmware, Linux (AP) services, RPC/D-Bus contracts, and Yocto/BitBake BSP, reducing time-based system errors by <b>98%</b>.</li>
                 <li>Optimized test infra/documentation, validated CI/CD pipelines, and triaged faults across deployed fleet devices.</li>
               </ul>`,
      },
      {
        title: "MAD Elevators Inc. — Embedded Developer Intern (May 2025 – August 2025)",
        body: `<p>Mississauga, ON</p>
               <ul>
                 <li>Reduced machine down-time/technician diagnosis by <b>50%</b> with escalator monitoring product.</li>
                 <li>Developed software in <b>Go/Python</b> for Linux IoT gateways, interfacing with escalator diagnostic hardware via <b>UART</b> and logging/communicating escalator safety telemetry to customers.</li>
                 <li>Automated <b>100%</b> of product provisioning using scripts developed in <b>Bash / PowerShell</b> with features such as remote SSH access, cellular modem provisioning, and Linux FOTA updates.</li>
                 <li>Implemented product-scalable features such as remote log retrievals, system management and custom telemetry data configuration — all integrated to cloud via <b>REST APIs</b>.</li>
               </ul>`,
      },
    ],
    images: [
      "https://via.placeholder.com/360x540/60a5fa/ffffff?text=Exp+1",
      "https://via.placeholder.com/360x540/3b82f6/ffffff?text=Exp+2",
      "https://via.placeholder.com/360x540/2563eb/ffffff?text=Exp+3",
    ],
    image: "https://via.placeholder.com/400x300/60a5fa/ffffff?text=Experience",
  },
  {
    id: "board3",
    title: "Skills",
    sections: [
      {
        title: "Languages",
        body: `<p>Embedded C/C++, Rust, Go, Python, Java, Assembly, SQL, MATLAB, Bash, PowerShell</p>`,
      },
      {
        title: "Embedded & Firmware",
        body: `<p>UART/RS-485, I2C, SPI, USB, RPC/protobufs, mmcli, Yocto, Embassy RUST, Linux BSP, PMIC State Machines, Time Sync (D-Bus/RPC)</p>`,
      },
      {
        title: "HDL & RTL Verification",
        body: `<p>SystemVerilog, Verilog, UVM, ModelSim, Questa, Quartus, FSM, VGA, PS2, Hardware Accelerators</p>`,
      },
      {
        title: "Machine Learning & Data Sciences",
        body: `<p>PyTorch, TensorFlow, TensorRT, CUDA, NumPy, Matplotlib, OpenCV, CNNs, GStreamer CUDA Tensors</p>`,
      },
      {
        title: "Cloud & CI/CD",
        body: `<p>RESTful APIs, Power BI, GitLab, Docker, Kubernetes, Jira, SQL Server, Google BigQuery, GitHub Actions</p>`,
      },
    ],
    images: [
      "https://via.placeholder.com/360x540/fbbf24/ffffff?text=Skill+1",
      "https://via.placeholder.com/360x540/f59e0b/ffffff?text=Skill+2",
      "https://via.placeholder.com/360x540/d97706/ffffff?text=Skill+3",
    ],
    image: "https://via.placeholder.com/400x300/fbbf24/ffffff?text=Skills",
  },
  {
    id: "board4",
    title: "About + Contact",
    sections: [
      {
        title: "Education",
        body: `<p><b>McMaster University</b> (Aug 2023 – May 2028)<br/>Bachelor of Computer Engineering, Hamilton, ON</p>
               <p><b>Relevant Coursework:</b> Digital Systems Design (3DQ5), Embedded Systems (2DX4)</p>`,
      },
      {
        title: "About Me",
        body: "<p>I’m Samarth — a Computer Engineering student at McMaster University passionate about firmware engineering, embedded Rust/C, RTL FPGA hardware acceleration, and edge ML!</p>",
      },
      {
        title: "Contact",
        body: `<p><b>Phone:</b> 647-937-7659<br/>
                  <b>Email:</b> <a href="mailto:samarthvijay714@gmail.com" target="_blank" rel="noopener noreferrer">samarthvijay714@gmail.com</a><br/>
                  <b>LinkedIn:</b> <a href="https://linkedin.com/in/samarth-vijay714" target="_blank" rel="noopener noreferrer">linkedin.com/in/samarth-vijay714</a><br/>
                  <b>GitHub:</b> <a href="https://github.com/samarthVijay" target="_blank" rel="noopener noreferrer">github.com/samarthVijay</a></p>`,
      },
    ],
    images: [asset("images/imageme1.jpeg"), asset("images/imageme2.jpeg"), asset("images/imageme3.jpeg")],
    image: "https://via.placeholder.com/400x300/f87171/ffffff?text=Contact",
  },
];
