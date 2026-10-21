# CDM 200 PLD 验证 —— BSP_IP 验证新人指导手册

> 本文档由 AI 辅助整理（2026-10-14，10-15 修订），内容汇总自公司 Wiki 上 CDM200 / SG2260 / SG2380 的 Palladium(PLD) 验证资料，以及 rtc_mcu 8051 固件 README 与 bsp-solutions `compile.sh` 实际逻辑（来源见文末「参考文档」）。涉及服务器路径、板卡分配、账号信息可能随时间变化，**以文末引用的最新 Wiki 页面为准**。

## 0. 一分钟了解你在做什么

**CDM200** 是一款定制算力的高带宽存储芯片：上层为 4 层 DRAM Die，下层为 Oxide Die（包含计算单元及逻辑），先进封装（AP）后通过 Interposer 与 TD62 芯片互联；一个完整系统由 **4 颗 CDM200 Die + 1 颗 TD62 Die** 组成，Die 间通过 UCIe 互联、GPIO 握手同步。

**PLD** = Cadence Palladium 硬件仿真加速器的简称。芯片流片前，验证团队把芯片 RTL 编译成 database 跑在 Palladium 硬件上，用真实软件（bootrom、fsbl、bmtest、linux 内核等）驱动它，效果约等于"提前拿到了一颗跑得慢的芯片"。

**BSP_IP 验证** = 在 PLD 上把芯片当"真芯片"用，逐项验证启动链路和各外设 IP（SPI/NorFlash、SD/eMMC、以太网、PCIe、UART、GPIO、I2C、中断、时钟、Reset、DDR 等）功能是否正确，同时让软件团队能提前开发 bringup 程序。

**你需要具备**：基本 Linux 命令行操作；看懂串口日志；了解 git。（Verilog/SystemVerilog/TCL 为加分项，查问题时会用到）

## 1. 整体流程总览

```
① 权限开通 ──► ② 登录 PLD 环境 ──► ③ 获取并启动 database
     │                                        │
     ▼                                        ▼
⑧ 记录结果 ◄── ⑦ 抓波形/分析 ◄── ⑥ 观察串口输出 ◄── ⑤ 编译测试程序+制作后门包 ◄── ④ 准备代码
     │                                        │
     └── 发现问题 ◄── 报错/异常 ◄─────────────┘
```

九个步骤对应下面九个章节，按顺序执行即可。

## 2. 第 0 步：权限开通（提前办，避免阻塞）

向 **IT 部门发邮件**（抄送 L1D 总监和处长），一次性申请三类权限：

| 权限 | 用途 |
|---|---|
| 项目 git 仓库权限 | 拉取 rtc_mcu（8051 测试固件）、bsp-solutions（后门打包）、bootloader 等代码（gerrit: https://gerrit-ai.sophgo.vip:8443/ ） |
| Palladium 服务器账户 | pl01（北京，Z1 编译调试）、npl01 / npl02（青岛，Z2 编译/调试，算能环境） |
| 英诺达 runtime server 账户 | 外租的英诺达 PLD 环境（部分项目使用） |

服务器对照：

| 服务器 | IP | 地点 | 用途 |
|---|---|---|---|
| pl01 | IP 隔离不可见 | 北京 | Z1 环境，PLD 编译+调试 |
| npl01 | 10.12.202.99 | 青岛 | Z2 环境，PLD 调试专用 |
| npl02 | 10.12.202.98 | 青岛 | Z2 环境，database 编译专用 |

> ⚠️ 综合/编译必须使用 RTL 源代码，**只能**在算能自己的 pl01/npl01/npl02 上进行，禁止在外租 runtime server 上跑综合。

## 3. 第 1 步：登录 PLD 环境

1. **飞连 VPN**：节点选择 **IC_CLOUD**。
2. **登录 ETX**：浏览器打开 https://10.243.12.6:8443/etx/ （或 https://10.243.12.5:8443/etx/ ，以开通账号时收到的网址为准）。首次使用会弹出客户端安装程序，装完重启。
3. 进入 ETX 后先到 **nbnode** 节点，打开终端：
   ```bash
   ssh -XY npl01        # 注意一定要带 -X 或 -XY（图形转发，xeDebug GUI 需要）
   ```
4. 在 npl01 上 source 环境（建议写进 `~/.bashrc`）：
   ```bash
   # CDM200 项目（青岛 Z2）
   source /local/ic/projects/env/Emu_setup_bash_2303_wxe004
   # 其他 SG2260/SG2380 项目常用（视项目而定）
   # source /ic/projects/env/Emu_setup_bash_2303
   ```
   pl01（北京 Z1）环境则为 `source /local/env/Emu_setup_bash_2005`。

**文件传输**：本地 → ETX 界面左上角图标 → File → File and Print Manager 上传到 nbnode；再用 `scp` 在 nbnode ↔ npl01 之间搬运（如 `scp pld_backdoor_xxx.tgz npl01:/local/<你的名字>/...`）。若权限不通，找内网 IT。

## 4. 第 2 步：获取并启动 CDM200 database

### 4.1 拿到 database

CDM200 的 PLD database 发布在 npl02：

```
/ic/projects/CDM200/users/zhuoyi.li/cdm200_pld/2_verify/1_pld_z2/prj/
```

首次使用完整拷贝一份 database 目录，之后**只需拷贝该 database 下的 `run` 目录**即可更新：

```bash
# 首次：
scp -r npl02:/ic/projects/CDM200/users/zhuoyi.li/cdm200_pld/2_verify/1_pld_z2/prj/<db名> .
# 后续更新：
scp -r npl02:.../<db名>/run ./<db名>/
```

一个 database 目录里主要有 4 样东西：**`c_build`**（后门加载的镜像数据）、**`Makefile`**（`make mrun` 入口）、**`run`**（运行数据，含 `run/*ver` 可查看 db 版本）、**`script`**（加载脚本）。

`script/` 里的关键文件：

| 脚本 | 作用 |
|---|---|
| `ip_proc.sh` | 加载 PLD 时配置 speedbridge 和板卡的参数（按板卡情况修改） |
| `reload_a55_rom.tcl` | 后门加载 CPU ROM 程序（CDM200 是 A55；SG2260 是 a53，注意区分） |
| `reload_ddr.tcl` | 加载 DDR 程序（默认空，按需改） |
| `reload_rom.tcl` | 加载 ROM 程序（默认空，按需改） |
| `reload_probe.tcl` | probe 波形抓取信号脚本（抓波形用） |

### 4.2 板卡资源与分配

启动前先查空闲板卡：`test_server`。CDM200 青岛环境的板卡分配（详见 `run/dbFiles/tb_cdm200_reloc.txt` 与参考文档 3）：

| PLD 板 | debugPC（VNC） | bmc |
|---|---|---|
| 0_T2 | 10.12.72.11:5901 | 10.12.64.11 |
| 0_T5 | 10.12.72.12:5901 | 10.12.64.12 |
| 0_T3 | 10.12.72.13:5901 | 10.12.64.13 |
| 0_T4 | 10.12.72.14:5901 | 10.12.64.14 |
| 0_T7 | 10.12.72.15:5901 | 10.12.64.15 |
| 0_T6 | 10.12.72.16:5901 | 10.12.64.16 |
| 0_T11 | 10.12.72.17:5901 | 10.12.64.17 |
| 0_T12 | 10.12.72.18:5901 | 10.12.64.18 |
| 0_T13 | 10.12.72.19:5901 | 10.12.64.19 |

debugPC 用 **VNC** 登录（VNC 密码 `Bitmain@2023`）。

### 4.3 启动 database

```bash
cd <db名>            # 如 example_db_deXpXX
make mrun IP=raX     # raX 换成分配给你的板卡，如 ra1
```

启动时注意观察 xeDebug 打印，**部分 error 不打红色容易被忽略**，导致 db 没起来。常见问题见第 10 章 FAQ。

## 5. 第 3 步：编译测试镜像（8051 MCU 固件）

> ⚠️ **与 SG2260/2380 不同**：CDM200 的 BSP_IP case 不是跑 bmtest，而是跑 **RTC 常开域里增强型 8051（mcs51）的测试固件**（`rtc_mcu` 仓库），固件自带串口 CLI。验证大表 Test Procedure 里写的 "Build bmtest / Loading bmtest.elf" 沿用了 Mars 模板，实际对应的就是编这份 8051 镜像。

### 5.1 编译 8051 测试固件

```bash
cd rtc_mcu/sdcc/cdm200        # 8051 测试固件仓库（本地示例: /home/alwaysla/CDM200PLD/rtc_mcu）

# 方式一（推荐）：用 build.sh 定向编译，自动切换 config.h 激活指定 IP
./build.sh <ip>               # ip ∈ {nmu wdt tempsen timer efuse gpio spi i2c dbgi2c smbus}，timer 也可写 dw_timer

# 方式二：手动改 include/config.h 的 CONFIG_TEST_*（一次只能一个为 1），再编
cd project/acp && make clean && make
```

- **SDCC 编译器仓库自带**（`rtc_mcu/tools/sdcc/`），无需 `apt install`
- 产物在 `project/acp/output/`：`CDM200.bin`（64KB）+ `CDM200_aa/_ab/_ac…`（8KB 拆分块，匹配 Palladium 加载）
- `CONFIG_TEST_*` 一次只开一个：同时开两个 → 链接报 `Multiple definition of _testcase_main`
- `mailbox` / `uart_log` / `aspi_master` / `initiator` / `follower` 等**角色由 Makefile `CHIP_ROLE` 派生**，`build.sh` 不切换（改 `config.h` 时这些角色块保持不动）
- 各 `CONFIG_TEST_*` 与测试 IP 的对应：DBGI2C→调试桥、DW_TIMER→DW Timer(8通道)、WDT→看门狗、TEMPSEN→温度传感器、I2C/SMBUS→I2C 主机、GPIO、SPI、NMU、EFUSE（骨架）

### 5.2 串口 CLI 与中断模型（跑 case 前必读）

固件启动序列：POR → crtstart.asm → `main()`：UART init(9600 8N1) → 注册 `help`/`rd`/`wr` → `testcase_main()`（激活 IP 的命令注册）→ `dw_ictl_irq_enable()` → CLI 主循环。

- `rd <addr>` / `wr <addr> <val>`：经 robot SFR 桥读写任意 32 位 SoC 寄存器，**调试时最常用**
- 中断是"两级聚合 + 软件分发"：各 IP 中断线 → dw_ictl（0x30000）汇总 → 拉 8051 INT0 → ISR 按位分发。**三条铁律**：① `dw_ictl_irq_enable()` 会屏蔽所有线，用中断必须 `request_dw_ictl_irq()` + `dw_ictl_unmask()`；② handler 返回前必须清外设源中断（如 Timer 读 EOI）；③ 注册槽上限 4 个（`MAX_REQUEST_NUM`），超了静默返回 -1
- 中断线号（FINALSTATUS 位号）在 `include/chip_cdm200.h`：GPIO0=0, GPIO1=1, I2C=2, MBOX0-3=3-6, SPI=7, SPIF=8, TEMPSEN=9, UART=10, WDT=11, TIMER=12, NMU=13-20, D2D=21-28
- ⚠️ Palladium 上 wall-clock 不准（仿真桥忙等），计时判断用硬件计数器（DW Timer / WDT CCVR）

### 5.3 编译完整固件链（后续跑 kernel 阶段才需要）

参考 SG2380/SG2260 的 BSP 编译文档（参考文档 11/12）：bootrom → zsbl → opensbi → kernel → ramdisk，均切到 PLD 分支/config 编译。SG2260 注意：`CONFIG_TARGET_PALLADIUM=y`、`CONFIG_TARGET_ASIC=n`。

## 6. 第 4 步：制作 PLD 后门启动包

"后门"指绕过真实 Flash/启动流程，用 Palladium 命令直接把镜像写进芯片仿真模型的 SRAM/Flash 里。制作脚本在 **bsp-solutions** 仓库（本地检出示例：`/home/alwaysla/CDM200PLD/bsp-solutions`）：

```bash
git clone https://gerrit-ai.sophgo.vip:8443/#/admin/projects/bsp-solutions
cd bsp-solutions/palladium/cdm200/      # CDM200 用这个目录（2260/2380 同理换目录名）

# 1. 把 5.1 编出的固件拷到 bin/（CDM200 的脚本固定读这两个文件名）
cp rtc_mcu/sdcc/cdm200/project/acp/output/CDM200.bin bin/CDM200.bin          # chip0 flash 后门（≤128KB）
cp <chip1 固件> bin/CDM200_chip1.bin                                        # chip1 sram 后门（双芯 case 才需要，≤128KB）

# 2. 运行打包脚本，产出 pld_backdoor.tgz
./compile.sh
```

**compile.sh 实际做的事**（脚本内逻辑，出问题对照排查）：

| 输入 | 处理 | 产物 |
|---|---|---|
| `bin/CDM200.bin`（chip0） | 逐字节转 hex（`hexdump -ve '1/1 "%02x\n"'`，匹配 m25p128 flash 模型） | `c_build/flash/flash.bin.text` + `script/reload_flash.tcl`（memory -load 到 `u_m25p128_0.m25p128_core_i.mem_array`） |
| `bin/CDM200_chip1.bin`（chip1） | `split -b 65536` 拆 64KB 块，每块按 32bit word 转 hex（`1/4 "%08x\n"'`，匹配 SRAM 模型） | `c_build/sram/sram_XX.bin.text` + `script/reload_sram.tcl`（逐块 memory -load 到 chip1 的 `u_mem_u_sram00_Y.ram_core`） |

- 两个 bin 都有 **128KB 上限**，超限脚本直接报错退出
- 运行结束 `script/`、`c_build/`、`workspace/` 会被自动清理（trap），只留 `pld_backdoor.tgz`
- 单芯 case 只需 `CDM200.bin`；跑双芯（aspi/mailbox 跨芯/UCIe/8051 Case3）才需要准备 `CDM200_chip1.bin`

然后把 tgz 传到 PLD 服务器工作目录解压，**替换原 database 里的 `c_build` 和 `script` 两个目录**：

```bash
scp pld_backdoor_xxx.tgz npl01:/local/<你的名字>/<工作目录>/
cd <db名> && tar zxvf ../pld_backdoor_xxx.tgz
```

CDM200 后门涉及的关键仿真模型路径（抓波形/调试时用，详见参考文档 4）：

| 用途 | 信号路径 |
|---|---|
| SPI NorFlash 模型 | `u_m25p128_0.m25p128_core_i.mem_array` |
| SRAM | `u_chip_top.chip_core.A_top_sys_pr_wrap.A_top_sys_pwr_wrap.A_top_sys.A_mcu_subsys_top.u_ahb_sram.u_mcu_sram_512k_wrap_slp.u_mem_u_sram00_0.ram_core` |
| 8051 PC | `u_chip_top.…u_mcu_8051_top.u_dw8051.reg_pc[15:0]` |
| 双芯 GPIO 同步 | `u_chip_top_chip1.chip_io.GPIO12` |
| SPI TX trigger | `u_chip_top_chip0.…u_peri_spi_mst.ssi_txd` / `ssi_ss_0_n` |
| ASPI 写入 trigger | `u_chip_top_chip1.…u_peri_aspi1.spi_sdi[0]` |

## 7. 第 5 步：启动并观察串口输出

1. 按第 4 章步骤 source 环境、`make mrun IP=raX` 启动 db。
2. **VNC 登录对应 debugPC**（板卡表见 4.2），开串口：`sudo minicom -D /dev/ttyUSB0 -b 9600`（端口可能随板卡变，参考对应项目的分配表）。若提示被占用，执行 `rm /var/lock/LCK..ttyUSB0` 后重试。
3. 串口里应能看到 8051 测试固件的启动 log，随后进入 CLI（`help` 可列出当前激活 IP 的命令）。**每个 IP 的验证 case 由 5.1 节 `CONFIG_TEST_*` 选中的 testcase 决定**，在 CLI 里执行对应命令、观察输出与 Expected Result 比对。

## 8. 第 6 步：抓波形与问题分析

case 异常时需要抓波形给 IC/DE 同事分析：

1. 在 xeDebug console 里先加载 probe 脚本（probe 层级要先跟 DE 核对，层级错了抓不到）：`source ../script/reload_probe.tcl`
2. GUI 切到 **Control** 页，依次设置：
   - **Trigger Expression**（找 DE 要触发信号；或 `sdl -expression ...`，条件里不要有空格）
   - **Wave DB Name**（fsdb 文件名）
   - **Trace Memory Size**（波形长度）
3. 点 **Run** 运行等待触发；触发后 console 打印 `Run stopped by Trigger Expression ...`。
4. **必须点 upload** 完成波形存储（状态条看进度）；存完后把 Wave DB Name 改成一个新名并确认（否则下次波形覆盖旧文件会缺文件）。
5. 波形拷回分析机：
   ```bash
   scp trace/trace_rp.fsdb nbnode02:/pld_files/
   # 英诺达环境：拷到 /pld_files/to_Tencent/，约 5 分钟后自动同步到 nbnode:/pld_files/enn_dat
   ```
6. **verdi 分析**（只能在 nbnode 上跑）：
   ```bash
   cd /ic/projects/CDM200/users/zhuoyi.li/pld_wave/verdi_run
   make verdi        # 单芯
   make mchip        # 双芯
   # nWave 打开 fsdb；若要拷贝到自己目录用，替换 flist/flist_verdi.f 里的代码路径
   ```

**抓波形必配**（写进 `iceRun.tcl`）：

```tcl
xeset timeUnit ns      # 否则 verdi 里时钟频率显示不对（默认 fclk）
xeset triggerPos 50    # 触发点放在波形 50% 处，否则可能找不到触发点
```

**查看/设置信号**（XE 命令行）：`value {a.b.c}` 查看；`force VAR 1'b1` 强制置位（信号被综合优化掉时需综合时加入 keepNet）。信号最顶层是 `u_chip_top`，不是 testbench 的 `test_top`。

## 9. BSP_IP 验证内容地图（验什么、按什么顺序）

PLD 资源有限，芯片逻辑放不下全部，要**分部分裁剪验证**。通用优先级：

1. **最小启动链**：bootrom → fsbl → opensbi → kernel → ramfs（先让串口打印起来）
2. **基础外设**：UART、JTAG、DDR（保证软件能继续干活）—— real DDR 未调通前先用 **fake DDR 版本的 database** 并行开发
3. **存储与外设**：SPI NorFlash → SD/eMMC → 以太网 → PCIe
4. **其余**：中断（PLIC/IntC）、时钟、Reset、Security、8051、UCIe 多 Die 互联等

CDM200 特有的验证关注点（来自 CDM200 交接文档）：

- **启动方式**：支持 Flash 启动和 SRAM 启动；启动地址寄存器在 `0x88-0x8c`，需配偏移量；多 Die 要求 ROM/SRAM/Top 寄存器地址映射一致
- **双芯/多 Die 同步**：Die0↔Die1、Die2↔Die3 通过 GPIO 握手（如 `GPIO12`），UCIe 初始化广播式配置；注意链路训练的时间窗口
- **SPI Flash 角色**：存启动固件 + Repair 数据（DRAM 坏点修复码）+ 芯片 UID；SRAM 不够时部分初始化代码要从 SPI Flash 读
- **8051**：不能用于精确计时；AP 与 8051 通过中断交互
- 中断、时钟、Reset 等基础项在验证大表中已基本覆盖；DRAM IP 测试项是已知遗留

日常进展记录建议参考 SG2260 PLD bringup daily report 的分类表（category/item/status，按 bootrom、fsbl、kernel、spi norflash、sd/emmc、eth、pcie、ddr 逐项跟踪）。

## 10. 常见问题 FAQ

| 现象 | 处理 |
|---|---|
| PLD 卡死/锁死 | `ps` 找到 xeDebug、DBEngine 进程 kill 掉，重启 |
| 启动 db 报 HSESB 相关错误 | 注释 `script/ip_proc.sh` 里对应编号的 HSESB_I1 行 |
| iceRun.tcl 最后一行 `wg` 报错 | 视情况注释掉该行 |
| 固件 bin 超 128KB | `compile.sh` 直接报错退出，需裁剪 case/驱动（CDM200 8051 镜像 CODE+XRAM 各 64KB，正常不会超） |
| 波形打开找不到信号 | 重新指定 Wave DB Name 重新 upload；检查 probe 层级 |
| verdi 时钟频率显示不对 | iceRun.tcl 加 `xeset timeUnit ns` |
| 波形里没有触发点 | iceRun.tcl 加 `xeset triggerPos 50` |
| minicom 提示端口被占用 | 删 `/var/lock/LCK..ttyUSB*` 后重开 |
| Flash 寄存器写不进去 | flash 地址 cacheable 时写操作会触发 cache read，需申请 noncacheable 版本的 db |
| 前提没满足 | 模块的寄存器访问和 base function case **仿真通过后才能上 PLD** |

## 11. 参考文档

| 编号 | 文档 | 链接 |
|---|---|---|
| 1 | Palladium 验证 COP（公司标准流程） | https://wiki.sophgo.com/pages/viewpage.action?pageId=175365413 |
| 2 | 芯片验证-Emulator 验证手册 | https://wiki.sophgo.com/pages/viewpage.action?pageId=120354664 |
| 3 | CDM200 palladium 环境登录（含板卡分配） | https://wiki.sophgo.com/pages/viewpage.action?pageId=218429941 |
| 4 | CDM200 palladium 后门脚本 | https://wiki.sophgo.com/pages/viewpage.action?pageId=218429959 |
| 5 | 02 CDM200 database userguide | https://wiki.sophgo.com/pages/viewpage.action?pageId=214984772 |
| 6 | PLD 跑 bmtest（SG2260 通用流程） | https://wiki.sophgo.com/pages/viewpage.action?pageId=106577789 |
| 7 | 2380 bmtest 本地编译及 PLD 运行 | https://wiki.sophgo.com/pages/viewpage.action?pageId=130201035 |
| 8 | 03 PLD waveform guide | https://wiki.sophgo.com/pages/viewpage.action?pageId=228912034 |
| 9 | DP/eDP 验证 COP（IP 验证 case 组织方式样例） | https://wiki.sophgo.com/pages/viewpage.action?pageId=154743665 |
| 10 | 任务交接—CDM200、SG2262（芯片架构/启动机制） | https://wiki.sophgo.com/pages/viewpage.action?pageId=228906661 |
| 11 | SG2380 How to Build BSP | https://wiki.sophgo.com/pages/viewpage.action?pageId=116892273 |
| 12 | SG2260 how to build bsp | https://wiki.sophgo.com/pages/viewpage.action?pageId=93277284 |
| 13 | SG2260 PLD bring up daily report（进度跟踪模板） | https://wiki.sophgo.com/pages/viewpage.action?pageId=208548305 |
| 14 | CDM200 空间主页 | https://wiki.sophgo.com/display/CDM200/ |
