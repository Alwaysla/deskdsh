# CDM200 8051 测试代码 ↔ 验证大表对照

> 对应仓库：`rtc_mcu/sdcc/cdm200`（8051 测试固件）× 验证大表 BSP_IPs（sheet 4–20，87 行）
> 关联：[逐行执行清单](https://wiki.sophgo.com/pages/viewpage.action?pageId=231613777) ｜ [执行记录](https://wiki.sophgo.com/pages/viewpage.action?pageId=231613734)
> 本文回答两个问题：① 每个 testcase 固件怎么用（自跑？敲什么命令？）；② 它覆盖大表哪几行。

## 0. 通用形态（先读这一段）

**编译**：`./build.sh <ip>` 切 `include/config.h` 的 `CONFIG_TEST_*`（一次一个 IP）；角色镜像用 `make CHIP_ROLE={uart_log|initiator|follower|aspi_master|link_master|mailbox}`。

**运行形态只有两种**：
- **自跑型**：boot 后自动执行（不等输入）——SPI trx、Timer multi、aspi/initiator/follower link、xdata(自研) 等
- **命令型**：boot 后只注册命令，CLI 里按需执行——WDT/TempSensor/GPIO/I2C/dbgI2C/eFuse/Mailbox/refresh/ecc 等

**核心命令（所有镜像都有，main.c 提供）**：`help`、`rd <addr>`、`wr <addr> <val>`（走 robot SFR 桥读写任意 SoC 32 位寄存器）。

**⚠️ main.c 现状（owner 主动注释，以此为基线）**：`cdm200_ram_init()`（DRAM 初始化+AXI BIST）**已被注释**，后续编译保持该状态——boot 更快，但 DRAM/refresh/ecc/axi-bist 相关 case 需临时恢复这几行（做完再注释回去）。

**中断模型三条铁律**（手册 5.2）：`dw_ictl_irq_enable()` 会屏蔽全部线，用中断必须 `request_dw_ictl_irq()` + `dw_ictl_unmask()`；handler 返回前清源；注册槽上限 4。串口里 `@@ low_irq=@@` 打印 = 中断线上报证据。

## 1. 大表 ↔ 代码 对照总表

| 大表 Case | 载体（镜像/角色） | 执行方式 | 判定/备注 |
|---|---|---|---|
| **4.SPI NOR-1** DMMR boot | db 自带 flash 镜像 | 起 db | ✅ 8051 从 flash 启动出 log |
| **5.8051-1** xdata path | `CONFIG_TEST_XDATA`（自研 testcase_xdata） | boot 自跑 | ❌ FAIL 已归档（窗口未桥接，待 DE） |
| **5.8051-2** robot SFR path | 任意镜像 | `rd 0xa000`→`wr 0xa000 <v>`→`rd`→恢复 | ✅ 回读一致 |
| **5.8051-3** sram boot（双芯） | chip0 `CHIP_ROLE=aspi_master` + chip1 sram 镜像 | `aspi_init`（配 rvba+释放 chip1 复位）→ chip1 串口出 log | 需双芯 db；chip1 需 sram 后门镜像 |
| **5.8051-4** spinor boot | 同 4.SPI NOR-1 | — | ✅ 同证据 |
| **6.UART-1/2** TX/RX | 任意镜像 | 自动打印流 + CLI 交互 | ✅ |
| **7.DRAM-1** CBUS NMU 读写 | 任意镜像 | `rd/wr` 直接访 CBUS NMU 寄存器 | 需地址表（问青耘）；`CONFIG_TEST_NMU` 目前**空壳**（无命令） |
| **7.DRAM-5/9/13** MC_MBIST/HW/SW refresh | `CONFIG_TEST_REFRESH`（依赖 DRAM 初始化） | `refresh_trigger`(设 temp=0)→`refresh_irq`/`refresh_recv`；`refresh_restore` 恢复 | ⚠️ 需临时恢复 main.c 的 `cdm200_ram_init()`；历史 Pass 有 fsdb |
| **7.DRAM-15/16** TRIM/refresh intr | 同上 | `refresh_irq`（中断经 dw_ictl 上报） | 同上 |
| **7.DRAM-2/3/17/18/20** AXI BIST 系列 | cacheram_init 的 AXI BIST（依赖注释行） | 历史 Pass；复验入口待 DE 确认 | ⚠️ 同依赖 |
| **8.I2C-1/2** master 单设备/频率 | `CONFIG_TEST_I2C`：`i2crr/i2crw/i2cdump/i2css` | 需外接 codec / 示波器 | ⛔ N/A 候选 |
| **8.I2C-3** dbgI2C 单字节 | `CONFIG_TEST_DBGI2C` | `read32 <slave> <alen> <off>` / `write32 ...` | ❓ PLD 无从机 NACK，待 DE |
| **8.I2C-4** dbgI2C 增量 | 同上 | `test_inc <slave> <off>` | ❓ 同上 |
| **8.I2C-5** slave ID override | 同上 | `change_id <slave> <new_id>` | ❓ 同上 |
| **9.SPI-1** loopback | `CONFIG_TEST_SPI` | boot 自跑 `do_trx()`（8-bit 内部回环 SRL=1）；CLI `trx`/`trx16` 可重跑 | 回环数据一致 |
| **9.SPI-3** mode3 | 同上 | `wr 0xe000 <mode3+SRL>`（期望值 0x000708C0）→ `trx` → `rd 0xe000` 核对 | 源码头注释给的核对方法 |
| **11.GPIO-1** input | `CONFIG_TEST_GPIO` | `gpio_in`（DDR=0）→ `gpio_get`（读 EXT_PORTA 0x50） | 回读一致 |
| **11.GPIO-2** output | 同上 | `gpio_out`/`gpio_out1`（反向回环 bit1出bit0入）→ `gpio_get` | 回读一致 |
| **11.GPIO-3** interrupt | 同上 | `gpio_irq`（EX0 边沿 + dw_ictl，安全 ISR） | 触发进 ISR |
| **11.GPIO-4** speed | 需示波器 | — | ⛔ N/A 候选 |
| **12.Timer-1** countdown | `CONFIG_TEST_DW_TIMER` | `timer_test`（8 通道串行，PLD 下约 2h） | 🔶 执行中 |
| **12.Timer-2** interrupt | 同上 | timer_test 内注册 ISR（ictl 线 12） | 待输出确认覆盖度 |
| **12.Timer-3** 精度 | 同上 | WDT 秒表比对段 | 待输出确认 |
| **12.Timer-4** 8 通道并发 | 同上 | `timer_multi`（boot 自跑） | ✅ Pass |
| **13.eFuse-1** embedded read | `CONFIG_TEST_EFUSE` | `efuse_test1` | EB 读回正确 |
| **13.eFuse-2** embedded write | 同上 | `efuse_test2`（单 bit 烧写回读） | bit=1 |
| **13.eFuse-3** ecc read | 同上 | `efuse_test3`（SRAM 映射读） | 数据正确 |
| **13.eFuse-4/5** direct rd/wr | 代码里 `efuse_test4/5` 被注释 | — | ⛔ 大表已 N/A（一致） |
| **13.eFuse-6** bootsel 覆盖 | 同上 | `efuse_test6`（⚠️ WARNING：真烧 efuse，PLD 模型里无妨） | bootsel 被覆盖 |
| **14.TempSensor-1** 读温度 | `CONFIG_TEST_TEMPSEN` | `tempsen_1` | 读回=force 值 |
| **14.TempSensor-2** 最大值 | 同上 | `tempsen_2` | 最大值正确 |
| **14.TempSensor-3/4/5** 阈值中断/计数/overheat | 同上 | `tempsen_3_4_5`（**一条命令覆盖 3 行**） | 触发/计数正确 |
| **14.TempSensor-6** overheat 复位 | 同上 | `tempsen_6` | 复位发生 |
| **15.WDT 全部 9 行** | `CONFIG_TEST_WDT` | **`wdt_test`（一键跑全部）**，或分项：`wdt_init`/`wdt_reg`/`wdt_feed`/`wdt_acc` | 逐项对 Expected Result |
| **16.Mailbox-1** local interrupt | `CHIP_ROLE=mailbox` 单芯 | `mbox_irq`（4 通道，自动清理） | ISR 触发 |
| **16.Mailbox-2** polling rw | 同上 | `mbox_poll` | 通道 0–3 读写一致 |
| **16.Mailbox-3/4** 跨芯 recv/send | chip0 `CHIP_ROLE=aspi_master`（自动带 mailbox 命令）+ chip1（角色待确认） | chip0 `mbox_send_ch <0-3>`；chip1 `mbox_recv` | 需双芯 db |
| **17.intc-1** interrupt send | 任意镜像 | 各用例中断打印 `@@ low_irq=@@` | ✅ 已有 dbg_i2c 0x4 证据 |
| **18.UCIe-1** link training | chip0 `initiator` + chip1 `follower`；**或 chip0 `link_master` 单端控制（chip1 ASPI 硬件 slave，无需固件）** | `init_link`→"init_link OK"；`follow_link`→"follow_link OK" | 需双芯 db |
| **18.UCIe-2** mainband 跨 Die | 同上 | `rd/wr` 访远端地址 | 读写一致 |
| **18.UCIe-3** 带宽 | axi-bist 跨 UCIe | 带宽数据 | 依赖 DRAM/BIST 流程 |
| **18.UCIe-4** sideband | 同上 | `sb_test`（initiator/follower 都有） | 通过 |
| **19.aspi-1** init | chip0 `CHIP_ROLE=aspi_master` | `aspi_init`（boot 自跑 full init） | chip1 ASPI **硬件** slave 响应 |
| **19.aspi-2** read remote | 同上 | `aspi_read` | 读回 rvba 寄存器 |
| **19.aspi-3** write remote | 同上 | `aspi_init` 内含写+回读 | 写入生效 |
| **19.aspi-4** release reset | 同上 | `aspi_rst` | chip1 8051 复位释放 |
| **20.axi-bist-1/2** 本地/跨 UCIe 带宽 | cacheram_init 的 AXI BIST | 历史数据（RO 117/119 GB/s）；复验需恢复注释行 | ⚠️ 依赖 cacheram_init |

## 2. 各 testcase 命令明细（速查）

| testcase（镜像） | CLI 命令 | 说明 |
|---|---|---|
| core（所有镜像） | `help` / `rd <addr>` / `wr <addr> <val>` | 帮助；robot 桥读；robot 桥写+自动回读 |
| DW_TIMER | `timer_test` / `timer_multi` | 逐通道测试；8 通道并发（boot 自跑 multi） |
| WDT | `wdt_init` / `wdt_reg` / `wdt_feed` / `wdt_acc` / `wdt_test` / `topr` / `topw` | 初始化+寄存器/寄存器转储/喂狗/精度/一键全跑/top 复位读写 |
| TEMPSEN | `tempsen_1` / `tempsen_2` / `tempsen_3_4_5` / `tempsen_6` / `tempsen_7_8` / `tempsen_clk` | 读温/最大/阈值中断+计数(三行)/过热复位/DDR 刷新率控制(表外)/时钟(未适配) |
| GPIO | `gpio_in` / `gpio_out` / `gpio_out1` / `gpio_get` / `gpio_irq` | 输入/输出/反向回环/读 EXT_PORTA/中断 |
| SPI | `trx` / `trx16` / `invert_cs` / `lsb` | 8bit 回环(boot 自跑)/16bit/CS 反相(CVitek 扩展)/LSB 优先 |
| I2C（master） | `i2crr` / `i2crw` / `i2cdump` / `i2css` | 读/写/转储/设速率（需外部从机） |
| DBGI2C | `change_id` / `test_inc` / `read32` / `write32` | slave ID 覆盖/增量读写/32 位读/32 位写 |
| SMBUS（表外） | `read` / `write` / `smbus_alert` / `speed` | 主从读写/alert/速率（十进制 Hz） |
| EFUSE | `efuse_ebrd <row>` / `efuse_ebwr <row> <bit>` / `efuse_test1/2/3/6` | EB 行读/EB 单 bit 写/嵌入式读/写/ECC 读/bootsel 覆盖(⚠️) |
| NMU | （空壳，无命令） | 7.DRAM Case1 用 core `rd/wr` 访 CBUS |
| REFRESH | `refresh_irq` / `refresh_recv` / `refresh_recv_stop` / `refresh_trigger` / `refresh_restore` / `refresh_set_chl <0-7>` | 单次中断/连续监控/停止/触发(temp=0)/恢复(temp=2)/选通道 |
| ECC | `ecc_irq` / `ecc_recv` / `ecc_recv_stop` / `ecc_diag` / `ecc_clear` / `ecc_set_chl <0-7>` | 武装/监控/停止/诊断/清中断/选通道（boot 自动 arm） |
| MAILBOX | `mbox_irq` / `mbox_recv` / `mbox_recv_stop` / `mbox_send` / `mbox_send_ch <0-3>` / `mbox_poll` / `mbox <0:irq 1:recv 2:send 3:poll>` | 本地中断/接收/停止/发送/指定通道发送/轮询读写/快捷入口 |
| ASPI_MASTER（角色） | `aspi_init` / `aspi_read` / `aspi_rst` / `aspi_ping` / `aspi <0:init 1:read 2:rst 3:ping>` | 全初始化(boot 自跑)/读 rvba/释放复位/连通性；自动附带 mailbox 命令 |
| INITIATOR（角色） | `init_aspi` / `init_link` / `init_full` / `init <0-2>` / `adp_show` / `sb_test` | ASPI 初始化/link training/全套/Adapter 寄存器/sideband 测试（boot 自跑 init_link） |
| FOLLOWER（角色） | `follow_wait` / `follow_link` / `follow_full` / `follow <0-2>` / `adp_show` / `sb_test` | 等 GPIO3/下行 training/全套/Adapter/sideband（boot 自跑 follow_link） |
| LINK_MASTER（角色） | 无额外命令 | **单芯片控双端** UCIe training：chip0 经 ASPI 配 chip1 寄存器，本地 upstream+远端 downstream 逐步做，chip1 无需固件；boot 自跑全流程 |
| UART_LOG（角色） | 仅 core 命令（+mailbox，若开） | 最小镜像，验证编译下载链 |

## 3. 关键发现与注意事项

1. **`cdm200_ram_init()` 已被注释（owner 基线）**：默认镜像 boot 不跑 DRAM 初始化。做 **7.DRAM（refresh/MBIST/BIST）、15 之外的 refresh/ecc、20.axi-bist** 时需**临时恢复 main.c 那几行**（`#ifndef CONFIG_UCIE` … `cdm200_ram_init();`），做完再注释回去。
2. **`CONFIG_TEST_NMU` 是空壳**（无命令注册）：7.DRAM Case 1（读写 CBUS NMU 寄存器）直接用 core `rd/wr` 完成，但**需要青耘/DE 提供 CBUS NMU 寄存器地址表**。
3. **chip1 不需要固件的场景**：`link_master` 注释明确"ASPI slave 是硬件响应，不需要 CPU 运行"——**19.aspi 全部 4 行、18.UCIe（link_master 单控路线）都不需要给 chip1 烧固件**。只有 **5.8051 Case 3（chip1 从 SRAM 启动）** 真正需要 chip1 sram 后门镜像。
4. **efuse 已实现且与表严丝合缝**：test1/2/3/6 ↔ 大表 Case 1/2/3/6；test4/5 被注释 ↔ 大表 Case 4/5 标 N/A。`efuse_test6` 带 WARNING（真实烧写，PLD 模型无碍，但**别在真机上乱敲**）。
5. **一条命令覆盖多行**：`tempsen_3_4_5` ↔ 大表 3 行；`wdt_test` 一键全跑 ↔ 大表 9 行（结果要逐项核对预期）。
6. **SMBus 是表外能力**：大表没有 SMBus sheet，代码里有完整 testcase，有余力可补验。
7. **自跑型镜像注意**：SPI/Timer-multi/aspi/initiator/follower/link_master/xdata 开机即自动执行——**部署重启前先开串口**，否则会错过输出（开日志落盘最稳）。
