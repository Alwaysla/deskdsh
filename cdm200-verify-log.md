# CDM200 PLD BSP_IP 验证执行记录

> 对应验证大表：`CDM200_PLD_SW_Verification.xlsx`（BSP_IP 功能验证，sheet 4~20 共 87 行）
> 执行人：张峻菱 ｜ 开始日期：2026-10-15 ｜ 最近更新：2026-10-19
> 操作手册：[CDM 200 PLD 验证](https://wiki.sophgo.com/pages/viewpage.action?pageId=231611333) ｜ 逐行清单：[CDM200 BSP_IP 验证逐行执行清单](https://wiki.sophgo.com/pages/viewpage.action?pageId=231613777) ｜ [8051 代码↔大表对照](https://wiki.sophgo.com/pages/viewpage.action?pageId=231614453)
> **环境结论（10-15）**：当前 db `cdm200_sop_mini` 为**单芯**（原脚本无 chip1 引用；reloc 18 槽同配置）。单芯 case 直接做；双芯 case（5.8051-3、19.aspi×4、16.Mailbox 跨芯×2、18.UCIe×4，共 11 行）需另找双芯 db。

## 一、按 IP 进度总览（大表顺序）

| # | Sheet | 行数 | ✅Pass | ❌Fail | ⛔Blocked | ⚠️待确认/待补 | 🔲未执行 | 状态 |
|---|---|---|---|---|---|---|---|---|
| 4 | SPI NOR | 1 | 1 | | | | | ✅ 完成 |
| 5 | 8051 | 4 | 3 | 1 | | | | ✅ 完成(仅Case1 Fail待DE) |
| 6 | UART | 4 | 2 | | | | 2(大表已N/A) | ✅ 完成 |
| 7 | DRAM | 26 | | | | | 26 | ⬜ 未开始(复验) |
| 8 | I2C | 6 | | | | 3(待DE) | 3 | 🔶 阻塞于DE |
| 9 | SPI | 2 | 2 | | | | | ✅ 完成 |
| 11 | GPIO | 4 | 3 | | | | 1(N/A候选) | ✅ 完成 |
| 12 | Timer | 4 | 4 | | | | | ✅ 完成 |
| 13 | eFuse | 6 | 3 | 1 | | | 2(N/A) | ✅ 完成(仅Case2待DE复跑) |
| 14 | Temp Sensor | 6 | 6 | | | | | ✅ 完成 |
| 15 | WDT | 9 | 8 | 1 | | 1(时钟源) | | 🔶 待DE裁定1项 |
| 16 | Mailbox | 4 | 4 | | | | | ✅ 完成 |
| 17 | intc | 1 | 1 | | | | | ✅ 完成 |
| 18 | UCIe | 4 | 4 | | | | | ✅ 完成 |
| 19 | aspi | 4 | 4 | | | | | ✅ 完成 |
| 20 | axi-bist | 2 | | | | | 2 | ⬜ 未开始(复验) |
| | **合计** | **87** | **25** | **1** | **1** | **5** | **55** | |

> 说明：WDT Case 8（精度）以旁证记 Pass；17.intc 的中断上报证据已随各 IP case 获得，正式归档时一并确认。

## 二、分 IP 执行记录

### 4.SPI NOR（1 行）✅ 完成

| Case | 目的 | 结果 | 执行摘要 / 证据 |
|---|---|---|---|
| 1 | DMMR mode boot | ✅ Pass 10-15 | 起 db（flash 后门镜像已在 m25p128 模型）；8051 从 flash 启动，串口出 CLI 并执行用例 |

### 5.8051（4 行）🔶 双芯待批次 2

| Case | 目的 | 结果 | 执行摘要 / 证据 |
|---|---|---|---|
| 1 | mcu xdata Path traverse | ❌ **FAIL 10-15** | 新增 testcase_xdata.c 按大表原步骤现场实现：doffset=0xA000 假设下 xdata 窗口 rd 回 0、wr 0xA5A5A5A5 不生效；robot 桥恢复值一致、无 SoC 破坏。结论：xdata 窗口未桥接 rtc_sys → **待 DE 确认语义/路径取舍**。截图：8051-case1-xdata-fail |
| 2 | mcu robot (SFR) Path traverse | ✅ Pass 10-15 | CLI rd 0xa000 → wr 0x12345678 → rd 回读 → 恢复 → 确认，回读逐位一致（兼作 6.UART Case 2 的 RX 证据）。截图：8051-case2-rdwr-pass |
| 3 | boot from RTC_AHB_SRAM | ✅ **Pass 10-20** | 双芯 db cdm200_sop_2chip_ucie：chip0 aspi_master boot 自跑 full init（配 rvba+释放）→ chip1 从 SRAM 启动出 `mailbox standalone` banner。截图：19aspi-c1-init-released-1020（左）+ 05-8051-c3-chip1-sram-boot-1020（右） |
| 4 | boot from SPINOR | ✅ Pass 10-15 | 与 4.SPI NOR Case 1 同证据（boot from flash + 串口 log） |

### 6.UART（4 行）✅ 完成

| Case | 目的 | 结果 | 执行摘要 / 证据 |
|---|---|---|---|
| 1 | UART TX | ✅ Pass 10-15 | boot 后自动打印流正常出现 |
| 2 | UART RX | ✅ Pass 10-15 | CLI 输入 rd/wr 命令回显并执行（截图同 5.8051 Case 2） |
| 3 | normal baud rate | ⛔ 大表已 N/A | kernel stty 切波特率，pld 无法验证 |
| 4 | max baud 1.5M | ⛔ 大表已 N/A | 需 FTDI+FPGA 环境 |

### 7.DRAM（26 行）⬜ 未开始（历史 Pass 待复验）

- 10-15 观察：切 XDATA 镜像时 cacheram_init 编入，启动序列打印 nmusys setup 配置（ECC/CPS/RW_HAMMER/MC_LAYER_INTLV 等）；未捕获 AXI BIST 带宽输出。
- 待办：编号 Case（基础/CBUS NMU 读写/AXI BIST/MBIST/HW·SW refresh/TRIM/refresh intr/1G size/性能/LTC）历史均 Pass 带 fsdb，复验入口待 DE 确认；未编号行（bist/repair/remap/interleave/refresh/QoS/ecc）大表原批注"需和青耘讨论能否在 pld 验证"；Case 1（CBUS NMU 读写）可用 core rd/wr + 青耘地址表执行。

### 8.I2C（6 行）🔶 阻塞于 DE

| Case | 目的 | 结果 | 执行摘要 / 证据 |
|---|---|---|---|
| 1 | master 单设备 | ⛔ N/A 候选 | 需外接 ADAU1372 codec，三方确认后定 |
| 2 | master 时钟频率 | ⛔ N/A 候选 | 需示波器 |
| 3 | dbgI2C 单字节读写 | ⚠️ 待判 10-15 | dbg_i2c 自动跑：总线速率配置正常(FS)；master 传输 TX_ABRT(src=1 地址 NACK)；中断 low_irq=0x4 上报后清零。PLD 无从机 → **待 DE 确认 slave 模型方案**，无则标 N/A |
| 4 | dbgI2C 增量读写 | ⚠️ 待判 10-15 | 同上 |
| 5 | dbgI2C slave ID override | ⚠️ 待判 10-15 | 同上 |
| 10 | Speed mode | 🔶 历史 Pass | 沿用前人次版记录 |

### 9.SPI（2 行）✅ 完成

| Case | 目的 | 结果 | 执行摘要 / 证据 |
|---|---|---|---|
| 1 | master loopback（SRL=1） | ✅ Pass 10-19 | boot 自跑 `trx`：TX/RX 逐字节一致，test PASS。截图：09spi-c1-c3-trx-pass-1019 |
| 3 | SPI mode3 | ✅ Pass 10-19 | 自跑配置即 mode3：`rd 0xe000=0x708C0`（SCPOL+SCPH 置位），回环通过；mode0 对照（0x70800+trx）可选补 |

### 11.GPIO（4 行）🔵 进行中

| Case | 目的 | 结果 | 执行摘要 / 证据 |
|---|---|---|---|
| 1 | GPIO input | ✅ Pass 10-19 | `gpio_in`→`gpio_get`：GPIO0/GPIO1 DDR 回读=0x0，EXT_PORTA=0x0（无驱动输入读0，合理）。截图：11gpio-c1-input-1019 |
| 2 | GPIO output | ✅ Pass 10-19 | `gpio_out`+`gpio_out1`(REV)：GPIO0 驱动高→EXT=0x3、驱动低→EXT=0x0，与 7 月历史 Pass 示例逐字节一致（示例红字注明依赖 gpio0↔gpio1 外接短接）；REV 方向亦通过。GPIO1 恒 0 = 无外部短接的环境差异，不影响判定。截图：11gpio-c2-output-p1/p2-1019 |
| 3 | GPIO interrupt | ✅ Pass 10-19 | `gpio_irq`：极性翻转触发双边；INTSTS=RAWSTS=0xFFFFFFFF；gpio_irq_count=2（两控制器各≥1）。截图：11gpio-c3-irq-1019 |
| 4 | speed | ⛔ N/A 候选 | 需示波器（大表已标 N/A，附 9.68KHz 历史数据） |

### 12.Timer（4 行）✅ 完成

| Case | 目的 | 结果 | 执行摘要 / 证据 |
|---|---|---|---|
| 1 | 8 通道 count down | ✅ Pass 10-16 | `timer_test` 8 通道串行跑完（约 2h40m），8/8 到期 |
| 2 | interrupt 模式 | ✅ Pass 10-16 | IRQ expire 打印出自 ISR（三环节因果链闭合） |
| 3 | 时间精度 | ⚠️ 方法学待确认 | WDT CCVR 秒表实测 500ms=配置；但大表 G 列 AE 要求**波形法**（7-08 历史输出 18/21ms 异常→时钟门控→AE 裁定）。当前 db 实测精确，**待 AE 确认软件法可否**；probe 层级已获（u_qstc_timer1loadcount：timer_clk/load_value/current_value） |
| 4 | 8 通道并发 | ✅ Pass 10-16 | boot 自跑 `timer_multi`：8/8 通道 delta=500ms |

### 13.eFuse（6 行）🔵 进行中

| Case | 目的 | 结果 | 执行摘要 / 证据 |
|---|---|---|---|
| 1 | Embedded Read | ✅ Pass 10-19 | `efuse_test1`：EB write 0xA0000000→phys rows 256/257，读回一致 [PASS]。截图：13efuse-c1-embedded-read-1019 |
| 2 | Embedded Write | ❌ **Failed 10-19**（严格记账） | 挂死前已验证：单bit烧写回读[OK]、全pattern写读一致；但 Procedure 未完成——"软复位重触发autoload"子步骤写 RTC_RSTCTRL bit10 挂死总线（与 WDT-13 同根因家族）。备注：核心功能证据保留，待 DE 裁定根因后可重跑补判。截图：13efuse-c2-embedded-write-1019 |
| 3 | ECC/SRAM Read | ✅ Pass 10-19 | `efuse_test3`：SRAM vs Shadow 16/16 一致(Match OK)，[PASS]。注：读出全0因 efuse 未编程 + test2 写入发生在 boot autoload 之后且 re-autoload 挂死未刷新——历史示例有值系其 re-autoload 成功；读路径本身验证完整。截图：13efuse-c3-ecc-read-1019 |
| 4/5 | Direct rd/wr | ⛔ 大表已 N/A | DE 说不需要验证（代码 test4/5 亦注释） |
| 6 | bootsel 覆盖 | ✅ **Pass 10-20（行为已验）** | 单芯会话内完成行为验证：①基线 rstn 复位(boot_sel=flash)→banner ✓ ②`efuse_test6` 烧 bit1 rows 48/49=0x2 [PASS] ③再 rstn 复位（boot_sel 仍=flash）→**死寂 5min+** = efuse 覆盖生效强制 SRAM 启动（SRAM 空故无声）。同条件唯一变量=已烧 bit，因果链闭合。截图：13efuse-c6-override-silence-1020 |

### 14.Temp Sensor（6 行）🔵 收官中

| Case | 目的 | 结果 | 执行摘要 / 证据 |
|---|---|---|---|
| 1 | 读温度值 | ✅ Pass 10-19 | `tempsen_1`：INT=9、irq_handler 触发、force 读回、自检 passed。截图：14tempsen-c1-read-temp-1019 |
| 2 | 最大值 | ✅ Pass 10-19 | `tempsen_2`：ch0=0x30、max=0x40>当前。截图：14tempsen-c2-max-temp-1019 |
| 3 | 高低阈中断 | ✅ Pass 10-19 | `tempsen_3_4_5`：over_hi bit4 / under_lo bit8 均触发 |
| 4 | 高低阈计数 | ✅ Pass 10-19 | hi/lo cnt 均=0x1 |
| 5 | overheat 中断 | ✅ Pass 10-19 | intr_raw bit20。截图：14tempsen-c3-c4-c5-threshold-1019 |
| 6 | overheat 复位 | ✅ **Pass 10-19** | 第一轮倒计时中固件成功写 clr 取消复位（overheat_reset_done）；第二轮走完 countdown=0 → sta_overheat_reset 锁存 1；MCU 未复位（clear 赢得赛跑）；自检 passed。截图：14tempsen-c6-overheat-reset-p1/p2/p3-1019 |

### 15.WDT（9 行）🔶 待 DE 裁定 1 项

| Case | 目的 | 结果 | 执行摘要 / 证据 |
|---|---|---|---|
| 1 | Watchdog reboot | ✅ Pass 10-19 | `wdt 1`：倒计时+到期+boot 重打。截图：15wdt-c1-c7-reboot-1019 |
| 3 | timeout normal mode | ⚠️ 部分 Pass | 超时配置+复位发生 ✅；"选择时钟源"项固件未覆盖 → 待 DE |
| 5 | Feed Watchdog | ✅ Pass 10-19 | 喂狗后 CCVR 回装 TOP×2；停止喂狗超时复位（对照）。截图：15wdt-c5-feed-1019 |
| 6 | Response 中断模式 | ✅ Pass 10-19 | `wdt 2`：Mode=1，首超时 Expire at 41ms（STAT 中断登记），二次超时复位。0x30030=0 系 MASK 语义（线未 unmask）；可选 rd 0x30020 抓 0x800。截图：15wdt-c6-response-int-1019 |
| 7 | Response direct reset | ✅ Pass 10-19 | 同 `wdt 1` 证据（SRMOD=0 直接复位路径）。截图同 Case 1 |
| 8 | timeout 时间精度 | ✅ Pass 10-19 | 旁证：CCVR 递减率=100MHz 标称；外推到期 334ms≈配置 335ms（0.3%） |
| 11 | 复位保持信息 | ✅ Pass 10-19 | `topw`→`wdt 1`→`topr`：GP11/12、C2C、RVBA 四寄存器 pattern 穿越复位保持；对照组 DEBUG_I2C_ID 0xEF→0xC0 证明复位真实发生。截图：15wdt-c11-keep-info-1019 |
| 12 | watchdog reset | ✅ Pass 10-19 | `wdt 4`：RSTCTRL 断言→WDT 寄存器清零→释放→CCVR=0xFFFF 默认。截图：15wdt-c12-top-reset-1019 |
| 13 | clk_apb_wdt gating | ❌ **Failed 10-19** | `wdt 5`：pull LOW 的 **mmio 写事务本身挂死**，系统冻结——Procedure 未完成，预期行为未达成。备注：与 eFuse-2 同属"TOP 复位/门控寄存器写挂总线"，待 DE 裁定根因后可视情重分类。截图：15wdt-c13-clkgate-hang-1019 |

### 16.Mailbox（4 行）✅ 完成

| Case | 目的 | 结果 | 执行摘要 / 证据 |
|---|---|---|---|
| 1 | local interrupt | ✅ Pass 10-19 | `mbox_irq`：4/4 通道 irq=1，Total=4。截图：16mbox-c1-local-irq-1019 |
| 2 | polling 读写 | ✅ Pass 10-19 | `mbox_poll`：4/4 通道写读一致(0x1234000N)。截图：16mbox-c2-poll-1019 |
| 3 | ISR 接收（跨芯） | ✅ Pass 10-20 | 数据 0xBEEF0000 经 ASPI 送达，chip1 `[MBOX interrupt]`+`[mbox] fired` 数据逐位一致。截图：16mbox-c3-recv-irq-1020 |
| 4 | ASPI 发送（跨芯） | ✅ Pass 10-20 | `mbox_send_ch 0~3` 4/4 送达；ch2/ch3 中断合并（PLD 慢 ISR 时序现象）。截图：16mbox-c4-send-ch-1020（与 aspi Case 3 共用） |

### 17.intc（1 行）✅ 完成

| Case | 目的 | 结果 | 执行摘要 / 证据 |
|---|---|---|---|
| 1 | interrupt 上报 | ✅ **Pass 10-20** | 四条独立中断线的上报证据随各 case 获得：dbg_i2c `low_irq=0x4`（I2C 线）、Timer `IRQ expire`（TIMER 线，自 ISR 打印）、tempsen `INT: 9`（TEMPSEN 线）、WDT Case 6 首超时 STAT 登记（WDT 线）。中断控制器 → EX0 → 8051 全链路在多 IP 上反复成立。 |

### 19.aspi（4 行）🔵 进行中（双芯 db 已到位）

| Case | 目的 | 结果 | 执行摘要 / 证据 |
|---|---|---|---|
| 1 | aspi init（SPI 配置+rvba+release） | ✅ Pass 10-20 | boot 自跑 full init 完成（ASPI released），chip1 实际启动可证。截图：19aspi-c1-init-released-1020 |
| 2 | aspi read | ✅ Pass 10-20 | chip0 `aspi_read`：读回 RVBA_CTRL0/1=0x400、XDATA_IFETCH=0xA00、XDATA_DREAD=0xA20、RSTCTRL=0xFFFFFFFF——与 boot 时 full init 的写入逐位吻合（代码纯 dump 无比对；正确参照系=配置值非默认值）；chip1 已实际启动为功能旁证。截图：19aspi-c2-read-1020 |
| 3 | write remote + readback | ✅ **Pass 10-20** | 复用 16mbox-c4 截图：chip0 侧 4 组"write data via ASPI + SET bit → 读回 STATUS_CPU0/SET_INT"完整写读环，值吻合（比 full init 内部写 GPIO1_CR 更显式） |
| 4 | release 8051 reset | ✅ Pass 10-20 | chip0 `aspi_rst` ×2：ASPI 事务成功 + RSTCTRL=0xFFFFFFFF 经 ASPI 读回（写读环=核心证据）；chip1 健康运行（回显响应）。注：无 banner 重打属正确行为——release 为幂等写 1，无复位沿；与 7 月历史 Pass 证据样式逐字一致。截图：19aspi-c4-release-1020 |

### 18.UCIe（4 行）🔵 进行中

| Case | 目的 | 结果 | 执行摘要 / 证据 |
|---|---|---|---|
| 1 | link training | ✅ **Pass 10-20** | initiator/follower 镜像 boot 自跑：chip0 `GPIO3 out low→init_link OK`；chip1 `GPIO3 high detected→follow_link OK`——双边训练 OK + GPIO3 握手时序完整。截图：18ucie-c1-linktrain-1020 |
| 2 | mainband 跨 die 访问 | ✅ **Pass 10-21** | link_master 自跑 Step 5：`UCIe DRAM BIST`（BIST 引擎经 mainband 全带宽访问对端 DRAM）PASS。截图：18ucie-c2-c3-axibist-1021 |
| 3 | mainband 带宽 | ✅ **Pass 10-21** | 实测：ucie_d2d0 RW 105.2GB/s（复测 97.5GB/s）vs 历史跨 UCIe RO 119GB/s——同量级（RW 混合模式本低于纯 RO）；本地 111.1/117.6GB/s vs 历史 117。截图同上 |
| 4 | sideband | ✅ **Pass 10-20** | chip0 `sb_test`：SB R0=0x0→写→SB R1=0x12345678（写值原样读回）→`SB PASS`。chip1 无输出属正常（sideband 硬件路径不经过 chip1 8051）。截图：18ucie-c4-sbtest-1020 |

### 20.axi-bist（2 行）⬜ 未开始（历史 Pass 待复验）

历史数据：本地 RO 117/WO 117/RW 114 GB/s；跨 UCIe RO 119/WO 114 GB/s。复验入口与 cacheram_init 依赖待确认。

## 三、待 DE/AE 确认事项汇总

| # | 事项 | 影响行 | 状态 |
|---|---|---|---|
| 1 | xdata 窗口（r51_xdata_doffset）语义/路径取舍 | 5.8051-1(Fail) | 待问 DE |
| 2 | PLD 上 I2C slave 模型方案（或标 N/A） | 8.I2C-3/4/5 | 待问 DE |
| 3 | Timer Case 3 软件秒表法（WDT CCVR）可否替代波形法 | 12.Timer-3 | 待问 AE（论据已备） |
| 4 | WDT Case 3"选择时钟源"如何实现 | 15.WDT-3 | 待问 DE |
| 5 | **TOP 复位/门控寄存器写挂总线**（WDT clk gate bit0、efuse soft reset bit10 均复现挂死；WDT bit14 正常）→ 两 case 已记 Failed，裁定根因后可重跑补判 | 15.WDT-13、13.eFuse-2 | 待问 DE |
| 6 | CBUS NMU 寄存器地址表（7.DRAM Case 1 用） | 7.DRAM | 待问青耘 |
| 7 | DRAM 未编号行可否在 PLD 验证 | 7.DRAM | 待问青耘 |
| 8 | 双芯 db `cdm200_sop_2chip_ucie` ✅ **已到位并跑通 10-20**（批次 2 进行中：剩 aspi×3、UCIe×4、Mailbox 跨芯×2） | 9 行 | 解决 |

## 四、统计

**范围：BSP_IPs（sheet 4–20），大表合计 87 项**（Passed 率 = Passed/(Total−N/A)）

| 类别 | 已执行 | Pass | Failed | Blocked | 待确认/待补 |
|---|---|---|---|---|---|
| 汇总 | 42 | 34 | 3 | 0 | 6 |

> 每次执行后更新本页；最终结果与证据回填大表 xlsx 的 PLD Test Result / Status and issues 列。

## 五、证据截图附录（原图存 /home/alwaysla/CDM200PLD/shots/）

### 5.8051 / 6.UART

![8051 Case1 xdata FAIL](/home/alwaysla/CDM200PLD/shots/8051-case1-xdata-fail.png)
![8051 Case2 rdwr PASS（兼 UART RX）](/home/alwaysla/CDM200PLD/shots/8051-case2-rdwr-pass.png)

### 12.Timer

![Timer Case1 逐通道](/home/alwaysla/CDM200PLD/shots/timer-case1.png)
![Timer Case4 并发](/home/alwaysla/CDM200PLD/shots/timer-case4.png)

### 9.SPI

![SPI trx PASS（0x708C0=mode3）](/home/alwaysla/CDM200PLD/shots/09spi-c1-c3-trx-pass-1019.png)

### 11.GPIO

![GPIO Case1 input](/home/alwaysla/CDM200PLD/shots/11gpio-c1-input-1019.png)
![GPIO Case2 output p1](/home/alwaysla/CDM200PLD/shots/11gpio-c2-output-p1-1019.png)
![GPIO Case2 output p2 REV](/home/alwaysla/CDM200PLD/shots/11gpio-c2-output-p2-1019.png)
![GPIO Case3 irq](/home/alwaysla/CDM200PLD/shots/11gpio-c3-irq-1019.png)

### 13.eFuse

![eFuse Case1](/home/alwaysla/CDM200PLD/shots/13efuse-c1-embedded-read-1019.png)
![eFuse Case2](/home/alwaysla/CDM200PLD/shots/13efuse-c2-embedded-write-1019.png)
![eFuse Case3](/home/alwaysla/CDM200PLD/shots/13efuse-c3-ecc-read-1019.png)

### 14.Temp Sensor

![TempSensor Case1](/home/alwaysla/CDM200PLD/shots/14tempsen-c1-read-temp-1019.png)
![TempSensor Case2](/home/alwaysla/CDM200PLD/shots/14tempsen-c2-max-temp-1019.png)
![TempSensor Case3/4/5](/home/alwaysla/CDM200PLD/shots/14tempsen-c3-c4-c5-threshold-1019.png)
![TempSensor Case6 p1](/home/alwaysla/CDM200PLD/shots/14tempsen-c6-overheat-reset-p1-setup-1019.png)
![TempSensor Case6 p2](/home/alwaysla/CDM200PLD/shots/14tempsen-c6-overheat-reset-p2-clear-1019.png)
![TempSensor Case6 p3](/home/alwaysla/CDM200PLD/shots/14tempsen-c6-overheat-reset-p3-passed-1019.png)

### 15.WDT

![WDT Case1/7 reboot](/home/alwaysla/CDM200PLD/shots/15wdt-c1-c7-reboot-1019.png)
![WDT Case5 feed](/home/alwaysla/CDM200PLD/shots/15wdt-c5-feed-1019.png)
![WDT Case6 response](/home/alwaysla/CDM200PLD/shots/15wdt-c6-response-int-1019.png)
![WDT Case11 keep-info](/home/alwaysla/CDM200PLD/shots/15wdt-c11-keep-info-1019.png)
![WDT Case12 top-reset](/home/alwaysla/CDM200PLD/shots/15wdt-c12-top-reset-1019.png)
![WDT Case13 clkgate hang](/home/alwaysla/CDM200PLD/shots/15wdt-c13-clkgate-hang-1019.png)

### 16.Mailbox

![Mailbox Case1](/home/alwaysla/CDM200PLD/shots/16mbox-c1-local-irq-1019.png)
