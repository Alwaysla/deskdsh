# CDM200 BSP_IP 验证逐行执行清单

> 范围：验证大表 sheet 4~20，共 87 行。每行给出：**载体（镜像/命令）→ 操作 → 判定预期 → 状态**。
> 关联：[验证执行记录](https://wiki.sophgo.com/pages/viewpage.action?pageId=231613734)（过程日志）｜[操作手册](https://wiki.sophgo.com/pages/viewpage.action?pageId=231611333)

**图例**：✅ 已 Pass ｜ 🔲 待执行 ｜ 🔶 历史 Pass（复验中，有前人 fsdb/log 证据）｜ ❓ 待 DE 确认 ｜ ⛔ N/A（大表已定或候选，候选需产品+软件+DE 三方确认）

**镜像速查**：
- 单芯 IP 镜像：`rtc_mcu/sdcc/cdm200` 下 `./build.sh <ip>`，ip ∈ {nmu, wdt, tempsen, timer, efuse, gpio, spi, i2c, dbgi2c, smbus}
- 角色镜像：`make CHIP_ROLE={uart_log|initiator|follower|aspi_master|link_master|mailbox}`（双芯用）
- 后门打包：`bsp-solutions/palladium/cdm200` 下 `./compile.sh`（输入 bin/CDM200.bin [chip0 flash] + bin/CDM200_chip1.bin [chip1 sram]，各≤128KB）→ pld_backdoor.tgz
- **SoC 寄存器访问全部经 robot SFR 桥**（readl/writel = read_robot/write_robot）；xdata 偏移路径代码已 `#if 0`

## 4.SPI NOR（1 行）

| Case | 目的 | 载体/操作 | 判定 | 状态 |
|---|---|---|---|---|
| 1 | DMMR mode boot | db 自带 flash 镜像，起 db | 8051 从 flash 启动 + 串口 log | ✅ Pass 10-15 |

## 5.8051（4 行）

| Case | 目的 | 载体/操作 | 判定 | 状态 |
|---|---|---|---|---|
| 1 | mcu xdata Path traverse | 新增 testcase_xdata 现场实现大表步骤（doffset=0xA000 假设 SoC=xdata+off） | 回读一致 | ❌ **FAIL 10-15**：xdata 窗口 wr 不生效/rd 回 0，robot 桥正常。待 DE 确认 doffset 语义或路径取舍 |
| 2 | mcu robot (SFR) Path | CLI `rd/wr` 回环（0xA000 Timer LOADCNT） | 回读值与写入一致 | ✅ **Pass 10-15**（初值0xFFFFFFFF→写0x12345678→读回一致→恢复） |
| 3 | boot from RTC_AHB_SRAM | 双芯：chip0 flash + chip1 sram，chip0 设 rvba 并释放 chip1 复位 | chip1 从 sram 启动出 log | 🔲 批次 2 |
| 4 | boot from SPINOR | 同 4.SPI NOR Case 1 | 串口 boot log | ✅ Pass 10-15（与 0.1 同证据） |

## 6.UART（4 行）

| Case | 目的 | 载体/操作 | 判定 | 状态 |
|---|---|---|---|---|
| 1 | UART TX | 任意镜像自动打印流 | 串口持续有输出 | ✅ Pass 10-15 |
| 2 | UART RX | CLI 交互（rd/wr 命令回显并执行） | 输入命令被执行 | ✅ **Pass 10-15**（同 5.8051 Case 2 截图证据） |
| 3 | normal baud rate | kernel `stty` 切波特率 | pld 无法验证 | ⛔ 大表已 N/A |
| 4 | max baud 1.5M | 需 FTDI+FPGA 环境 | pld 无法验证 | ⛔ 大表已 N/A |

## 7.DRAM（26 行；编号行多已 Pass 带 fsdb，未编号行待讨论）

| Case | 目的 | 判定 | 状态 |
|---|---|---|---|
| 1 | 基础：读写 CBUS NMU 寄存器 | 读写正常 | 🔶 历史 PASS |
| 2 | AXI BIST：单笔 1024bit，寄存器设 pattern | 读写正确 | 🔶 历史 PASS |
| 3 | 读写测试：256B intlv AXI BIST | 读写正确 | 🔶 历史 PASS |
| 5 | MC_MBIST：HW_refresh+intlv 128M mode0 | 通过 | 🔶 历史 PASS |
| 9 | HW refresh：RH disable 模拟升温 | 有 fsdb 证据 | 🔶 历史 PASS |
| 13 | SW refresh：RH enable + DWRF=1 | 有 fsdb 证据 | 🔶 历史 PASS |
| 15 | TRIM：tXTRIM=2ms | 有 fsdb 证据 | 🔶 历史 PASS |
| 16 | refresh intr：低温超 IRQ | 有 fsdb 证据 | 🔶 历史 PASS |
| 17 | AXI BIST 1G size（pattern 全 0/1） | 读写 1G size PASS | 🔶 历史 |
| 18 | 性能：跨 die（otsd 限，功能正常即可） | 通路+功能正常 | 🔶 历史 PASS |
| 20 | DRAM BIST：LTC_READ_TEST | 通过 | 🔶 历史 PASS |
| — | bist / repair / dram / remap / interleave / refresh / QoS / ecc | 大表原批注"需和青耘讨论能否在 pld 上验证" | ❓ 待 DE（青耘）确认 |

## 8.I2C（6 行）

| Case | 目的 | 载体/操作 | 判定 | 状态 |
|---|---|---|---|---|
| 1 | master 单设备 | 需外接 ADAU1372 codec | pld 无从机 | ⛔ N/A 候选（三方确认） |
| 2 | master 时钟频率 | 需示波器测 SCL/SDA | pld 无法测 | ⛔ N/A 候选 |
| 3 | dbgI2C 单字节读写 | 待 slave 模型方案 | 读写一致 | ❓ 本次运行 NACK+中断链路正常，待 DE |
| 4 | dbgI2C 增量读写 | 同上 | 256B 增量一致 | ❓ 同上 |
| 5 | dbgI2C slave ID override | 同上 | override 生效 | ❓ 同上 |
| 10 | Speed mode | 历史已跑 | — | 🔶 历史 Pass |

## 9.SPI（2 行）— 载体：CONFIG_TEST_SPI

| Case | 目的 | 操作 | 判定 | 状态 |
|---|---|---|---|---|
| 1 | master loopback | `SPI_INTERNAL_LOOPBACK=1`，spi_init(1) 配置 CTRL0 后收发 | 数据回环一致 | 🔲 批次 1 |
| 3 | SPI mode（mode3） | SDO-SDI 短接（若可内部切换则同镜像） | 收发正确 | 🔲 批次 1 |

## 11.GPIO（4 行）— 载体：CONFIG_TEST_GPIO

| Case | 目的 | 判定 | 状态 |
|---|---|---|---|
| 1 | input（DDR=0 回读） | 回读一致 | 🔲 批次 1 |
| 2 | output（DR 驱动回读） | 回读一致 | ✅ **Pass 10-19**（GPIO0 双向 loopback 与历史 Pass 示例一致；GPIO1 恒0=无外接短接环境差异） |
| 3 | interrupt（EX0 边沿 + ictl） | 触发进 ISR | ✅ **Pass 10-19**（count=2，INTSTS=RAWSTS=0xFFFFFFFF） |
| 4 | speed | 需示波器/逻辑分析仪 | ⛔ N/A 候选 |

## 12.Timer（4 行）— 载体：CONFIG_TEST_DW_TIMER

| Case | 目的 | 判定 | 状态 |
|---|---|---|---|
| 1 | 8 通道 count down | 到期状态正确 | ✅ **Pass 10-16**（8/8 到期） |
| 2 | interrupt 模式 | 各通道 ISR 打印 | ✅ **Pass 10-16**（IRQ expire 出自 ISR） |
| 3 | 时间精度 | 毫秒数准确 | ⚠️ **方法学待确认**：WDT CCVR 秒表实测 500ms✅，但大表 G 列注明 AE 要求**波形法**（背景：7-08 历史输出 expire=18/21ms 异常→时钟动态门控→AE 裁定波形测频率+装载值；本次 10-16 实测精确 500ms 说明当前 db 无此问题）→ 问 AE 软件法是否认可 |
| 4 | 8 通道并发 | 无互相干扰 | ✅ **Pass 10-16**（boot 自跑 8/8 delta=500ms） |

## 13.eFuse（6 行）— 载体：CONFIG_TEST_EFUSE（README 标注为骨架，先确认实现度）

| Case | 目的 | 判定 | 状态 |
|---|---|---|---|
| 1 | embedded read（DFT 区 256/257 行） | 读回正确 | ✅ **Pass 10-19**（write 0xA0000000→rows 256/257 读回一致） |
| 2 | embedded write（单 bit 烧写回读） | bit31=1 | ❓ 同上 |
| 3 | ecc read（SRAM 映射读） | 数据正确 | ❓ 同上 |
| 4 | Direct read | — | ⛔ 大表已 N/A（DE 说不需要验证） |
| 5 | Direct write | — | ⛔ 大表已 N/A |
| 6 | efuse 覆盖 bootsel | bootsel 被覆盖 | ✅ **Pass 10-20**：烧 bit1 后 rstn 复位（boot_sel=flash）→死寂=覆盖强制SRAM启动；基线对照(烧前同条件→banner)因果闭合 |

## 14.Temp Sensor（6 行）— 载体：CONFIG_TEST_TEMPSEN

| Case | 目的 | 判定 | 状态 |
|---|---|---|---|
| 1 | 读温度值（force value） | 读回=force 值 | ✅ **Pass 10-19**（tempsen_1 自检 passed + INT9 中断旁证） |
| 2 | 最大值 | T1/T2 最大正确 | ✅ **Pass 10-19**（ch0 max=0x40>当前 0x30，自检 passed） |
| 3 | 高低阈中断 | 触发/恢复各一次 | ✅ **Pass 10-19**（over_hi bit4 / under_lo bit8 均触发） |
| 4 | 高低阈计数 | 计数正确 | ✅ **Pass 10-19**（hi/lo cnt 均=0x1） |
| 5 | overheat 中断 | 触发 | ✅ **Pass 10-19**（intr_raw bit20） |
| 6 | overheat 复位 | 复位发生 | ✅ **Pass 10-19**（clr 赛跑胜出取消复位 + sta 锁存 1；passed） |

## 15.WDT（9 行）— 载体：CONFIG_TEST_WDT；已有 10-15 15:50 段历史 log（init/feed/精度）

| Case | 目的 | 判定 | 状态 |
|---|---|---|---|
| 1 | watchdog reboot（首超时复位） | 复位发生 | ✅ **Pass 10-19**（wdt 1：倒计时+到期+boot 重打） |
| 3 | timeout normal mode | 超时复位 | ⚠️ 部分 Pass 10-19（超时配置+复位✅；"选择时钟源"项固件未覆盖→待 DE） |
| 5 | Feed Watchdog | 喂狗后计数重置、中断清除 | ✅ **Pass 10-19**（CCVR 回装 TOP×2 + 不喂超时复位对照） |
| 6 | Response 中断模式 | 第一次 timeout 收中断 | ✅ **Pass 10-19**（Expire at 41ms=STAT 中断登记；二次超时复位） |
| 7 | Response direct reset | timeout 直接复位 | ✅ **Pass 10-19**（同 wdt 1 证据，Mode=0） |
| 8 | timeout 时间精度 | 实测=配置 | ✅ **Pass 10-19**（旁证：CCVR 递减率=100MHz，外推到期 334ms≈335ms 配置，误差 0.3%；wdt_acc 可选复跑） |
| 11 | reset 后保持信息 | dump=配置值 | ✅ **Pass 10-19**（topw→wdt 1→topr：GP11/12 等 4 寄存器 pattern 穿越复位保持；DEBUG_I2C_ID 0xEF→0xC0 作对照证明复位真实发生） |
| 12 | watchdog reset（soft_reset） | CCVR 重置 | ✅ **Pass 10-19**（wdt 4：RSTCTRL 断言→寄存器清零→释放→CCVR=0xFFFF 默认） |
| 13 | clk_apb_wdt gating | 关时钟后读寄存器异常/行为符合设计 | ❌ **Failed 10-19**：门控写事务挂死，Procedure 未完成（根因待 DE 裁定，可重跑补判） |

## 16.Mailbox（4 行）

| Case | 目的 | 载体/操作 | 判定 | 状态 |
|---|---|---|---|---|
| 1 | local interrupt | CHIP_ROLE=mailbox 单芯 | 中断触发 | ✅ **Pass 10-19**（4/4 通道 irq=1，Total=4） |
| 2 | polling 读写 | 同上 | 通道 0~3 读写一致 | ✅ **Pass 10-19**（4/4 OK） |
| 3 | ISR 接收（跨芯） | chip0 aspi_master + chip1 mailbox | chip0 收到 chip1 数据 | 🔲 批次 2 |
| 4 | ASPI 发送（跨芯） | 同上 | chip1 收到正确数据 | 🔲 批次 2 |

## 17.intc（1 行）

| Case | 目的 | 载体/操作 | 判定 | 状态 |
|---|---|---|---|---|
| 1 | interrupt send | 随各用例中断打印覆盖（`@@ low_irq=@@`）；dbg_i2c 已见 0x4 | 中断源上报正确 | ✅ 可判 Pass（待正式归档） |

## 18.UCIe（4 行）— 双芯：CHIP_ROLE=initiator（chip0）+ follower（chip1）

| Case | 目的 | 判定 | 状态 |
|---|---|---|---|
| 1 | link & training | 链路训练成功 | 🔲 批次 2 |
| 2 | mainband 跨 Die 访问 | 读写正确 | 🔲 批次 2 |
| 3 | UCIe 带宽（axi-bist） | 带宽符合预期 | 🔲 批次 2 |
| 4 | sideband 跨 Die 访问 | 读写正确 | 🔲 批次 2 |

## 19.aspi（4 行）— 双芯：CHIP_ROLE=aspi_master（chip0）+ chip1（无 aspi_slave 角色，疑硬件响应，待 DE 确认）

| Case | 目的 | 判定 | 状态 |
|---|---|---|---|
| 1 | aspi init | 初始化成功 | 🔲 批次 2 |
| 2 | read remote reg | 读回正确 | 🔲 批次 2 |
| 3 | write remote reg | 写入生效 | 🔲 批次 2 |
| 4 | release reset on second chip | chip1 启动 | 🔲 批次 2 |

## 20.axi-bist（2 行）

| Case | 目的 | 判定 | 状态 |
|---|---|---|---|
| 1 | axi bist 访问本地 DRAM | RO 117 / WO 117 / RW 114 GB/s | 🔶 历史 Pass（复验入口 ❓ 待确认） |
| 2 | 跨 UCIe 访问对端 DRAM | RO 119 / WO 114 GB/s | 🔶 历史 Pass（同上） |

---

## 覆盖度汇总（87 行）

| 分类 | 行数 | 说明 |
|---|---|---|
| ✅ 已 Pass（本次执行） | 3 | SPI NOR-1、8051-4、UART-1 |
| 🔶 历史 Pass 待复验/初判 | ~30 | DRAM 编号行、I2C-10、WDT-5/8、axi-bist 等（有前人 fsdb/log） |
| 🔲 待执行 | ~35 | 单芯镜像（Timer/GPIO/SPI/WDT 全量/TempSensor/eFuse/Mailbox 单芯）+ 双芯（aspi/Mailbox 跨芯/UCIe/8051-3） |
| ❓ 待 DE 确认 | ~12 | 8051-1、DRAM 未编号行、I2C-3/4/5、eFuse 实现度、aspi chip1 角色、axi-bist 复验入口 |
| ⛔ N/A | ~7 | UART-3/4、eFuse-4/5、I2C-1/2、GPIO-4（候选需三方确认） |

> 每行执行后：① 更新本页状态列；② 过程写[执行记录](https://wiki.sophgo.com/pages/viewpage.action?pageId=231613734)；③ 最终把结果与证据回填大表 xlsx 对应行的 PLD Test Result / Status and issues 列。
