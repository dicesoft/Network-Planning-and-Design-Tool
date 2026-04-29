# DWDM Optical Engineering Knowledge Base (v2 — Fact-Checked)

A comprehensive reference for Dense Wavelength Division Multiplexing (DWDM) optical networking concepts, formulas, and system design principles. This document is intended as a self-contained knowledge base for engineers, developers, and AI systems working with optical network planning and simulation.

> **v2 Note:** This version has been fact-checked against peer-reviewed literature, textbooks, and ITU-T standards. Two erroneous formulas have been corrected, three claims have been clarified, and inline references `[n]` have been added throughout. See the [References](#references) section at the end for full citations.

---

## Table of Contents

1. [Fundamentals of DWDM](#1-fundamentals-of-dwdm)
2. [Fiber Propagation Physics](#2-fiber-propagation-physics)
3. [Nonlinear Interference](#3-nonlinear-interference-nli)
4. [Raman Effects](#4-raman-effects)
5. [Optical Amplification](#5-optical-amplification)
6. [Signal Quality Metrics](#6-signal-quality-metrics)
7. [Network Elements](#7-network-elements)
8. [Spectral Information Model](#8-spectral-information-model)
9. [Network Design and Planning](#9-network-design-and-planning)
10. [Transceiver Modes and Modulation Formats](#10-transceiver-modes-and-modulation-formats)
11. [End-to-End Propagation Simulation](#11-end-to-end-propagation-simulation)
12. [Reference Tables and Constants](#12-reference-tables-and-constants)
13. [Glossary](#13-glossary)
14. [References](#14-references)

---

## 1. Fundamentals of DWDM

### 1.1 Wavelength Division Multiplexing

Wavelength Division Multiplexing (WDM) transmits multiple optical signals simultaneously over a single fiber by assigning each signal a different wavelength (color) of light. DWDM uses closely spaced channels in the infrared spectrum, enabling dozens to hundreds of independent channels on one fiber.

The usable spectrum in silica fiber is divided into bands:

```mermaid
graph LR
    S["S-Band<br/>1460-1530 nm<br/>~196-205 THz"] --- C["C-Band<br/>1530-1565 nm<br/>~191-196 THz"] --- L["L-Band<br/>1565-1625 nm<br/>~184-191 THz"]

    style C fill:#2563eb,color:#fff
    style L fill:#7c3aed,color:#fff
    style S fill:#059669,color:#fff
```

- **C-Band** (Conventional): The primary DWDM operating window. Lowest fiber loss, mature amplifier technology (EDFA).
- **L-Band** (Long): Extended capacity band. Used when C-band is fully occupied.
- **S-Band** (Short): Emerging for next-generation capacity expansion.

### 1.2 ITU-T Frequency Grid

The ITU-T G.694.1 standard [[1]](#ref-1) defines the channel plan for DWDM systems. All channels are referenced to an anchor frequency with a finest granularity of 6.25 GHz:

$$f_n = 193.1 \text{ THz} + n \times 6.25 \text{ GHz}$$

where $n$ is any integer (positive, negative, or zero).

> **Clarification:** The 6.25 GHz value is the **flexible grid (flexi-grid)** granularity defined in ITU-T G.694.1 [[1]](#ref-1). Traditional fixed-grid DWDM systems use channel spacings of 12.5, 25, 50, or 100 GHz. The formula above describes the finest resolution of the frequency grid, not necessarily the channel spacing.

<details><summary>Pseudo Code</summary>

```python
def frequency_from_slot(n):
    """ITU-T G.694.1 channel frequency from slot number."""
    return 193.1e12 + n * 6.25e9  # Hz
```

</details>

**Common grid spacings:**

| Spacing | Channels in C-band (~4.8 THz) | Use Case |
|---------|-------------------------------|----------|
| 100 GHz | ~48 | Legacy fixed-grid |
| 50 GHz | ~96 | Standard DWDM |
| 25 GHz | ~192 | High-density DWDM |
| 12.5 GHz | ~384 | Flexible grid |
| 6.25 GHz | ~768 | Finest granularity |

**Flexible Grid (Flexi-Grid):** Each channel occupies a slot defined by a center frequency and a slot width that is a multiple of 12.5 GHz [[1]](#ref-1)[[16]](#ref-16). This enables mixed-rate systems where 400G channels can coexist with 100G channels using different slot widths.

### 1.3 Frequency and Wavelength

Frequency and wavelength are related through the speed of light:

$$f = \frac{c}{\lambda}, \quad \lambda = \frac{c}{f}$$

where:
- $f$ = frequency (Hz)
- $\lambda$ = wavelength (m)
- $c$ = speed of light in vacuum ($2.998 \times 10^8$ m/s)

**Convention:** Channel planning uses frequency (THz) for precision. Fiber properties (attenuation, dispersion) are often specified at a reference wavelength (typically 1550 nm = 193.41 THz).

### 1.4 Power Units and Conversions

Optical power is expressed in both linear and logarithmic units:

$$P_{\text{dBm}} = 10 \log_{10}\!\left(\frac{P_{\text{mW}}}{1 \text{ mW}}\right)$$

$$P_{\text{W}} = 10^{P_{\text{dBm}}/10} \times 10^{-3}$$

**General dB conversions (ratios):**

$$\text{lin2db}(x) = 10 \log_{10}(x)$$

$$\text{db2lin}(x) = 10^{x/10}$$

<details><summary>Pseudo Code</summary>

```python
def dbm_to_watt(p_dbm):
    """Convert power from dBm to Watts."""
    return 10 ** (p_dbm / 10) * 1e-3

def watt_to_dbm(p_w):
    """Convert power from Watts to dBm."""
    return 10 * log10(p_w * 1e3)
```

</details>

**Power Spectral Density (PSD):** Power per unit frequency bandwidth, typically expressed in mW/GHz or W/Hz. For a channel with baud rate $B$:

$$P_{\text{dBm}} = 10 \log_{10}(B \times \text{PSD}_{\text{mW/GHz}} \times 10^{-9})$$

<details><summary>Pseudo Code</summary>

```python
def psd_to_power_dbm(baud_rate_hz, psd_mw_per_ghz):
    """Convert PSD (mW/GHz) to channel power (dBm)."""
    return 10 * log10(baud_rate_hz * 1e-9 * psd_mw_per_ghz)
```

</details>

**Quick reference:**

| dBm | mW | W |
|-----|-----|------|
| +23 | 200 | 0.2 |
| +20 | 100 | 0.1 |
| +3 | 2 | 0.002 |
| 0 | 1 | 0.001 |
| -3 | 0.5 | 0.0005 |
| -10 | 0.1 | 0.0001 |
| -20 | 0.01 | 0.00001 |

---

## 2. Fiber Propagation Physics

### 2.1 Fiber Attenuation

Optical power decays exponentially as it propagates through fiber (Beer-Lambert law) [[2]](#ref-2)[[3]](#ref-3):

$$P(z) = P(0) \cdot e^{-\alpha z}$$

where:
- $P(z)$ = power at distance $z$ (W)
- $\alpha$ = attenuation coefficient (Neper/m) — **note:** must be in Neper/m, not dB/km; see conversion below
- $z$ = distance along fiber (m)

<details><summary>Pseudo Code</summary>

```python
def fiber_attenuation(power_in, alpha_neper_per_m, length_m):
    """Output power after fiber propagation."""
    return power_in * exp(-alpha_neper_per_m * length_m)
```

</details>

**Conversion from dB/km to Neper/m:**

$$\alpha_{\text{Np/m}} = \frac{\alpha_{\text{dB/km}}}{10 \log_{10}(e) \times 10^3} \approx \frac{\alpha_{\text{dB/km}}}{4343}$$

<details><summary>Pseudo Code</summary>

```python
def db_per_km_to_neper_per_m(alpha_db_km):
    """Convert attenuation from dB/km to Neper/m."""
    return alpha_db_km / (10 * log10(e) * 1e3)  # approx alpha_db_km / 4343
```

</details>

**Total span loss** includes fiber attenuation, connector losses, and any inline lumped losses:

$$L_{\text{total}} = \alpha_{\text{dB/km}} \times L_{\text{km}} + L_{\text{con,in}} + L_{\text{con,out}} + \sum L_{\text{lumped}}$$

Typical attenuation at 1550 nm: 0.2 dB/km for standard single-mode fiber (SSMF). Attenuation is frequency-dependent and can be modeled with an interpolation function over the operating band.

### 2.2 Chromatic Dispersion (CD)

Different wavelengths travel at different group velocities in fiber, causing pulse broadening [[3]](#ref-3). The dispersion parameter $D$ (ps/nm/km) relates to the propagation constant:

$$\beta_2(f) = -\frac{(c / f)^2 \cdot D(f)}{2\pi c}$$

This is mathematically equivalent to the standard form $\beta_2 = -D\lambda^2 / (2\pi c)$ since $\lambda = c/f$ [[3]](#ref-3).

where:
- $\beta_2$ = group velocity dispersion (s$^2$/m)
- $D$ = dispersion coefficient (s/m$^2$, typically expressed as ps/(nm$\cdot$km))
- $f$ = optical frequency (Hz)

<details><summary>Pseudo Code</summary>

```python
def beta2_from_dispersion(freq_hz, dispersion_s_per_m2):
    """Compute group velocity dispersion parameter (s^2/m)."""
    c = 2.998e8
    return -(c / freq_hz) ** 2 * dispersion_s_per_m2 / (2 * pi * c)
```

</details>

**Dispersion with slope:**

$$D(\lambda) = D(\lambda_{\text{ref}}) + S \cdot (\lambda - \lambda_{\text{ref}})$$

where $S$ is the dispersion slope (ps/nm$^2$/km).

**Accumulated CD over fiber length $L$:**

$$\text{CD}_{\text{acc}} = \left[\beta_2 + 2\pi \beta_3 (f - f_{\text{ref}})\right] \cdot \frac{2\pi f_{\text{ref}}^2}{c} \cdot L$$

where $\beta_3$ captures higher-order dispersion. Units: ps/nm (or equivalently, s/m after appropriate scaling).

<details><summary>Pseudo Code</summary>

```python
def accumulated_cd(beta2, beta3, freq, freq_ref, length):
    """Accumulated chromatic dispersion over fiber length (s/m)."""
    c = 2.998e8
    return (beta2 + 2 * pi * beta3 * (freq - freq_ref)) * (2 * pi * freq_ref ** 2 / c) * length
```

</details>

### 2.3 Polarization Mode Dispersion (PMD)

Fiber birefringence causes a random differential group delay (DGD) between orthogonal polarization modes [[4]](#ref-4). PMD accumulates statistically:

**Single span:**

$$\Delta\tau = \mathrm{PMD\_coef} \times \sqrt{L}$$

where:
- $\Delta\tau$ = differential group delay (s)
- $\mathrm{PMD\_coef}$ = PMD coefficient (s/$\sqrt{\text{m}}$), typically 0.04 ps/$\sqrt{\text{km}}$
- $L$ = fiber length (m)

**Multi-element accumulation (root-sum-of-squares):**

$$\text{PMD}_{\text{total}} = \sqrt{\text{PMD}_1^2 + \text{PMD}_2^2 + \cdots + \text{PMD}_N^2}$$

<details><summary>Pseudo Code</summary>

```python
def pmd_single_span(pmd_coef, length_m):
    """DGD for a single fiber span."""
    return pmd_coef * sqrt(length_m)

def pmd_total(pmd_list):
    """Total PMD across multiple elements (root-sum-of-squares)."""
    return sqrt(sum(p ** 2 for p in pmd_list))
```

</details>

### 2.4 Polarization Dependent Loss (PDL)

PDL is the ratio of maximum to minimum transmission through an element, expressed in dB. It accumulates statistically across elements:

$$\text{PDL}_{\text{total}} \approx \sqrt{\text{PDL}_1^2 + \text{PDL}_2^2 + \cdots + \text{PDL}_N^2}$$

### 2.5 Nonlinear Coefficient

The Kerr effect causes the refractive index to depend on light intensity [[3]](#ref-3). The strength of fiber nonlinearity is captured by:

$$\gamma(f) = \frac{2\pi f \cdot n_2}{c \cdot A_{\text{eff}}}$$

This is equivalent to $\gamma = 2\pi n_2 / (\lambda \cdot A_{\text{eff}})$ since $f = c/\lambda$ [[3]](#ref-3).

where:
- $\gamma$ = nonlinear coefficient (1/(W$\cdot$m))
- $n_2$ = nonlinear refractive index ($\approx 2.6 \times 10^{-20}$ m$^2$/W for silica)
- $A_{\text{eff}}$ = effective mode area (m$^2$)

Typical value for SSMF: $\gamma \approx 1.3$ (W$\cdot$km)$^{-1}$ at 1550 nm.

<details><summary>Pseudo Code</summary>

```python
def gamma_nonlinear(freq_hz, n2, a_eff):
    """Fiber nonlinear coefficient (1/(W·m))."""
    c = 2.998e8
    return 2 * pi * freq_hz * n2 / (c * a_eff)
```

</details>

### 2.6 Effective Length

Nonlinear effects are significant only where optical power is high. The effective length captures this [[3]](#ref-3):

$$L_{\text{eff}} = \frac{1 - e^{-\alpha L}}{\alpha}$$

For long fibers ($\alpha L \gg 1$), this saturates at the asymptotic length:

$$L_{\text{eff}} \to L_{\text{asym}} = \frac{1}{\alpha}$$

For $\alpha = 0.046$ Np/km (0.2 dB/km), $L_{\text{asym}} \approx 21.7$ km.

<details><summary>Pseudo Code</summary>

```python
def effective_length(alpha, length):
    """Nonlinear effective length of fiber."""
    return (1 - exp(-alpha * length)) / alpha
```

</details>

```mermaid
flowchart LR
    A["Signal In"] --> B["Connector<br/>Loss (in)"]
    B --> C["Fiber Span"]
    C --> D["Connector<br/>Loss (out)"]
    D --> E["Signal Out"]

    C --- F["Attenuation<br/>P(z) = P₀·e⁻ᵅᶻ"]
    C --- G["Chromatic Dispersion<br/>β₂ accumulation"]
    C --- H["PMD<br/>Δτ = PMD·√L"]
    C --- I["Nonlinear<br/>Interference (NLI)"]
    C --- J["Raman<br/>Power Transfer"]

    style C fill:#1e40af,color:#fff
    style F fill:#f59e0b,color:#000
    style G fill:#f59e0b,color:#000
    style H fill:#f59e0b,color:#000
    style I fill:#ef4444,color:#fff
    style J fill:#ef4444,color:#fff
```

---

## 3. Nonlinear Interference (NLI)

### 3.1 Kerr Nonlinear Effects

In a WDM system, the Kerr effect produces three types of nonlinear interference:

- **Self-Phase Modulation (SPM):** A channel's own intensity modulates its own phase.
- **Cross-Phase Modulation (XPM):** Other channels' intensities modulate the phase of the channel under test.
- **Four-Wave Mixing (FWM):** Interaction between three frequencies generates a fourth frequency component.

In modern coherent systems with high-cardinality modulation (16QAM, 64QAM), NLI can be modeled as additive Gaussian noise [[5]](#ref-5)[[6]](#ref-6). This is the foundation of the GN and GGN models.

### 3.2 The GN Model (Gaussian Noise Model)

The GN model [[5]](#ref-5)[[6]](#ref-6) computes NLI power as a function of channel powers, fiber parameters, and spectral arrangement. The classical GN model assumes **rectangular** (flat-top) channel spectra.

**NLI power per channel under test (CUT):**

$$P_{\text{NLI}}(f_{\text{cut}}) = \sum_{\text{pump}} P_{\text{cut}} \cdot P_{\text{pump}}^2 \cdot \eta(f_{\text{cut}}, f_{\text{pump}})$$

where $\eta$ is the NLI efficiency coefficient:

$$\eta = \frac{\gamma^2 \cdot w \cdot \psi}{B_{\text{cut}} \cdot B_{\text{pump}}^2}$$

- $\gamma$ = fiber nonlinear coefficient
- $w$ = polarization weight factor:
  - SPM: $w = 16/27 \approx 0.593$ [[5]](#ref-5)
  - XPM: $w = 32/27 \approx 1.185$ [[5]](#ref-5)
- $B_{\text{cut}}$, $B_{\text{pump}}$ = baud rates of CUT and pump channels

<details><summary>Pseudo Code</summary>

```python
def gn_model_nli(power_cut, powers_pump, eta_matrix):
    """NLI power on channel under test (GN model)."""
    return sum(power_cut * p_pump ** 2 * eta
               for p_pump, eta in zip(powers_pump, eta_matrix))

def nli_efficiency(gamma, weight, psi, baud_cut, baud_pump):
    """NLI efficiency coefficient eta."""
    return gamma ** 2 * weight * psi / (baud_cut * baud_pump ** 2)
```

</details>

**The psi ($\psi$) function:**

$$\psi = \frac{L_{\text{eff}}^2}{2\pi |\beta_2| L_{\text{asym}}} \left[\text{arcsinh}\!\left(\pi^2 L_{\text{asym}} |\beta_2| B_{\text{cut}} \cdot f_R\right) - \text{arcsinh}\!\left(\pi^2 L_{\text{asym}} |\beta_2| B_{\text{cut}} \cdot f_L\right)\right]$$

where:
- $f_R = \Delta f + B_{\text{pump}}/2$, $f_L = \Delta f - B_{\text{pump}}/2$
- $\Delta f$ = frequency separation between CUT and pump
- $L_{\text{asym}} = 1/\alpha$ (asymptotic effective length)

<details><summary>Pseudo Code</summary>

```python
def psi_gn(l_eff, beta2, l_asym, baud_cut, delta_f, baud_pump):
    """GN model psi function."""
    f_r = delta_f + baud_pump / 2
    f_l = delta_f - baud_pump / 2
    coeff = l_eff ** 2 / (2 * pi * abs(beta2) * l_asym)
    return coeff * (arcsinh(pi ** 2 * l_asym * abs(beta2) * baud_cut * f_r)
                  - arcsinh(pi ** 2 * l_asym * abs(beta2) * baud_cut * f_l))
```

</details>

### 3.3 The GGN Model (Generalized Gaussian Noise)

The GGN model (also called EGN model) [[7]](#ref-7) extends the GN model to account for:
- **Non-flat channel spectra** (raised-cosine pulse shaping) — **note:** the classical GN model [[5]](#ref-5) assumes rectangular spectra; raised cosine shaping is handled by the GGN/EGN extensions [[7]](#ref-7)
- **Raman gain profiles** along the fiber (non-uniform power evolution)
- **Frequency-dependent fiber parameters** ($\gamma$, $\beta_2$, $\alpha$)

The generalized NLI integral becomes:

$$\psi_{\text{gen}} = \int\!\!\int \text{RC}(f_1) \cdot \text{RC}(f_2) \cdot |\rho_{\text{NLI}}(f_1, f_2)|^2 \, df_1 \, df_2$$

where $\rho_{\text{NLI}}$ is the generalized NLI field profile accounting for Raman-induced power variations along the fiber, and $\text{RC}(f)$ is the raised cosine spectral shape.

Two approximation levels are commonly used:
- **Spectrally Separated**: Full double integral with raised-cosine shaping per channel pair
- **Approximate (Closed-Form)**: Asymptotic expressions for well-separated channels, reducing computational cost

### 3.4 Raised Cosine Spectral Shaping

The raised cosine defines the spectral shape of a modulated channel:

$$\text{RC}(f) = \begin{cases} 1 & |f - f_c| \leq \frac{(1-\alpha_r)B}{2} \\[6pt] \frac{1}{2}\left[1 + \cos\!\left(\frac{\pi}{B\alpha_r}\left(|f - f_c| - \frac{(1-\alpha_r)B}{2}\right)\right)\right] & \frac{(1-\alpha_r)B}{2} < |f - f_c| < \frac{(1+\alpha_r)B}{2} \\[6pt] 0 & |f - f_c| \geq \frac{(1+\alpha_r)B}{2} \end{cases}$$

where:
- $f_c$ = channel center frequency
- $B$ = baud rate (symbol rate)
- $\alpha_r$ = roll-off factor (0 to 1). Typical value: 0.15

The total occupied bandwidth is $(1 + \alpha_r) \cdot B$.

<details><summary>Pseudo Code</summary>

```python
def raised_cosine(f, f_center, baud_rate, roll_off):
    """Raised cosine spectral shape."""
    df = abs(f - f_center)
    b, r = baud_rate, roll_off
    if df <= (1 - r) * b / 2:
        return 1.0
    elif df < (1 + r) * b / 2:
        return 0.5 * (1 + cos(pi / (b * r) * (df - (1 - r) * b / 2)))
    else:
        return 0.0
```

</details>

```mermaid
flowchart TD
    IN["Input:<br/>Channel Powers + Fiber Params + Raman Profile"] --> SEL{"Select NLI Method"}

    SEL -->|GN Analytic| GN["Compute η matrix<br/>using closed-form ψ"]
    SEL -->|GGN Spectrally Separated| GGN["For each CUT × pump:<br/>Double integral with<br/>RC shaping + Raman ρ"]
    SEL -->|GGN Approximate| GGNA["Asymptotic ψ<br/>for well-separated channels"]

    GN --> OUT["NLI Power per Channel (W)<br/>P_NLI = Σ P_cut · P_pump² · η"]
    GGN --> OUT
    GGNA --> OUT

    style SEL fill:#7c3aed,color:#fff
    style OUT fill:#059669,color:#fff
```

---

## 4. Raman Effects

### 4.1 Stimulated Raman Scattering (SRS)

SRS transfers energy from shorter-wavelength (higher-frequency) channels to longer-wavelength channels through photon-phonon interaction in the fiber [[14]](#ref-14). This creates a power tilt across the WDM spectrum.

**Raman coupling coefficient [[3]](#ref-3)[[14]](#ref-14):**

$$c_r(f_i, f_j) = \frac{\gamma_{\text{Raman}}(f_i - f_j) \cdot f_i}{A_{\text{eff,overlap}}}$$

where:
- $\gamma_{\text{Raman}}(\Delta f)$ = normalized Raman gain spectrum (measured profile, peak at ~13 THz offset)
- $A_{\text{eff,overlap}}$ = effective area overlap between interacting modes

<details><summary>Pseudo Code</summary>

```python
def raman_coupling(freq_i, freq_j, gamma_raman_profile, a_eff):
    """Raman coupling coefficient between channels i and j."""
    return gamma_raman_profile(freq_i - freq_j) * freq_i / a_eff
```

</details>

**The SRS coupled differential equation (per channel $i$):**

$$\frac{dP_i}{dz} = P_i\left(-\alpha_i + \sum_j c_r(f_i, f_j) \cdot P_j(z)\right)$$

This captures both gain (from higher-frequency channels) and depletion (toward lower-frequency channels) simultaneously.

### 4.2 Perturbative Raman Solver

For moderate SRS tilt, a perturbative expansion provides an efficient solution [[13]](#ref-13):

$$P_i(z) = P_{i,0} \cdot e^{-\alpha_i z + \gamma_1(z) + \gamma_2(z) + \gamma_3(z) + \gamma_4(z)}$$

**Order 1** (dominant effect):

$$\gamma_1(z) = \sum_j c_{r,ij} \cdot P_{j,0} \cdot L_{\text{eff},j}(z)$$

**Order 2** (gain-on-gain correction):

$$\gamma_2(z) = \sum_j c_{r,ij} \int_0^z e^{-\alpha_j z'} \gamma_{1,j}(z') \, dz'$$

**Order 3:**

$$\gamma_3(z) = \sum_j c_{r,ij} \int_0^z e^{-\alpha_j z'} \left[\gamma_{2,j}(z') + \tfrac{1}{2}\gamma_{1,j}(z')^2\right] dz'$$

**Order 4:**

$$\gamma_4(z) = \sum_j c_{r,ij} \int_0^z e^{-\alpha_j z'} \left[\gamma_{3,j}(z') + \gamma_{1,j}(z')\gamma_{2,j}(z') + \tfrac{1}{6}\gamma_{1,j}(z')^3\right] dz'$$

Higher orders provide progressively more accurate results at higher computational cost. Order 2 is sufficient for most practical scenarios.

<details><summary>Pseudo Code</summary>

```python
def raman_perturbative_order1(cr_matrix, launch_powers, l_eff_per_ch):
    """First-order perturbative Raman gain correction."""
    n = len(launch_powers)
    gamma1 = [sum(cr_matrix[i][j] * launch_powers[j] * l_eff_per_ch[j]
                  for j in range(n)) for i in range(n)]
    return gamma1
```

</details>

### 4.3 Numerical Raman Solver

For high accuracy or strong Raman regimes, direct step-by-step integration of the coupled ODEs:

$$P_i(z + \Delta z) = P_i(z) \cdot \left[1 + \left(-\alpha_i + \sum_j c_{r,ij} \cdot P_j(z)\right) \Delta z\right] \cdot L_{\text{lumped}}(z)$$

where $L_{\text{lumped}}$ accounts for any discrete losses at position $z$. The solver iterates until convergence (residue tolerance ~$10^{-6}$).

<details><summary>Pseudo Code</summary>

```python
def raman_numerical_step(powers, alpha, cr_matrix, dz):
    """Single step of numerical Raman ODE integration."""
    n = len(powers)
    new_powers = []
    for i in range(n):
        gain = sum(cr_matrix[i][j] * powers[j] for j in range(n))
        new_powers.append(powers[i] * (1 + (-alpha[i] + gain) * dz))
    return new_powers
```

</details>

### 4.4 Spontaneous Raman Scattering

The Raman process also generates spontaneous emission noise, governed by the Bose-Einstein phonon distribution [[3]](#ref-3)[[15]](#ref-15):

$$P_{\text{SpRS},i} = 2 h B_i f_i (1 + \eta_{\text{BE}}) \cdot c_r(f_i, f_{\text{pump}}) \cdot \int_0^L \frac{P_{\text{pump}}(z)}{\text{loss}_i(z)} \, dz$$

where the Bose-Einstein thermal factor:

$$\eta_{\text{BE}} = \frac{-1}{1 - e^{h \Delta f / (k_B T)}}$$

- $h$ = Planck's constant
- $k_B$ = Boltzmann's constant
- $T$ = fiber temperature (K)
- $\Delta f$ = frequency offset between pump and signal
- Factor of 2 accounts for dual polarization

<details><summary>Pseudo Code</summary>

```python
def spontaneous_raman_noise(h, baud, freq, eta_be, cr, pump_power_integral):
    """Spontaneous Raman scattering noise power (dual-pol)."""
    return 2 * h * baud * freq * (1 + eta_be) * cr * pump_power_integral
```

</details>

```mermaid
flowchart TD
    Q{"Raman<br/>Enabled?"}
    Q -->|No| SIMPLE["Simple attenuation:<br/>P(z) = P₀ · e⁻ᵅᶻ"]
    Q -->|Yes| PUMP{"Raman pumps<br/>defined?"}
    PUMP -->|No| SIG["Inter-channel SRS only<br/>(signal-signal Raman)"]
    PUMP -->|Yes| DIR{"Pump<br/>direction?"}
    DIR -->|Co-propagating| UNI["Unidirectional solver<br/>(perturbative or numerical)"]
    DIR -->|Counter-propagating| UNI
    DIR -->|Both| BIDIR["Iterative bidirectional<br/>solver (convergence loop)"]

    style Q fill:#7c3aed,color:#fff
    style SIMPLE fill:#059669,color:#fff
    style SIG fill:#2563eb,color:#fff
    style UNI fill:#2563eb,color:#fff
    style BIDIR fill:#ef4444,color:#fff
```

---

## 5. Optical Amplification

### 5.1 EDFA Fundamentals

The Erbium-Doped Fiber Amplifier (EDFA) is the workhorse of DWDM networks. It provides optical-domain amplification across the C-band (~1530-1565 nm) or L-band (~1565-1625 nm) without optical-to-electrical conversion.

**Key parameters:**
- **Gain** ($G$): Signal amplification factor (dB). Typical: 15-35 dB.
- **Noise Figure** (NF): SNR degradation caused by the amplifier (dB). Typical: 4-7 dB.
- **Maximum Output Power** ($P_{\text{max}}$): Saturation limit (dBm). Typical: 21-25 dBm.
- **Gain bandwidth**: Frequency range over which the amplifier operates.

### 5.2 Amplifier Noise -- ASE

Amplified Spontaneous Emission (ASE) is the dominant noise source in optically amplified links [[8]](#ref-8). The ASE power generated by an amplifier in both polarizations, integrated over the signal bandwidth:

$$P_{\text{ASE}} = 2 \cdot n_{sp} \cdot (G - 1) \cdot h \cdot f \cdot B_{\text{signal}}$$

Or equivalently, expressed in terms of noise figure:

$$P_{\text{ASE}} = (\text{NF}_{\text{linear}} \cdot G - 1) \cdot h \cdot f \cdot B_{\text{signal}}$$

where:
- $h = 6.626 \times 10^{-34}$ J$\cdot$s (Planck's constant)
- $f$ = signal center frequency (Hz)
- $B_{\text{signal}}$ = signal bandwidth / baud rate (Hz)
- $G$ = amplifier gain (linear)
- $n_{sp}$ = spontaneous emission factor ($\geq 1$; relates to population inversion)
- $\text{NF}_{\text{linear}} = 10^{\text{NF}_{\text{dB}}/10} = 2 n_{sp}$ (for a high-gain amplifier)
- The factor of 2 accounts for dual polarization [[8]](#ref-8)

> **v2 Correction:** The v1 formula `P_ASE = h·f·B·NF` was **incomplete** — it omitted the gain factor $(G-1)$ and the factor of 2 for dual polarization. The correct formula from Desurvire [[8]](#ref-8) is shown above.

<details><summary>Pseudo Code</summary>

```python
def ase_noise(h, freq, baud_rate, nf_db, gain_db):
    """ASE noise power from an EDFA in both polarizations (W)."""
    nf_linear = 10 ** (nf_db / 10)
    gain_linear = 10 ** (gain_db / 10)
    return (nf_linear * gain_linear - 1) * h * freq * baud_rate
```

</details>

**Physical interpretation:** The quantum-limited minimum noise figure is 3 dB (one spontaneous emission photon per mode, $n_{sp} = 1$). Practical EDFAs achieve 4-6 dB [[8]](#ref-8).

### 5.3 Noise Figure Models

**Fixed Gain Model:** Constant NF regardless of operating point.

**Variable Gain (Two-Stage) Model — Friis' Formula [[9]](#ref-9):**

$$\text{NF}_{\text{avg}} = 10\log_{10}\!\left(10^{\text{NF}_1/10} + \frac{10^{\text{NF}_2/10} - 1}{10^{G_1/10}}\right)$$

where:
- $\text{NF}_1$ = first stage (preamp) noise figure
- $\text{NF}_2$ = second stage (booster) noise figure
- $G_1$ = first stage gain

This is Friis' formula [[9]](#ref-9) applied to cascaded optical amplifiers: the first stage dominates the overall noise figure when its gain is high.

**Dual-Stage Cascade (Friis' formula in linear units) [[9]](#ref-9):**

$$\text{NF}_{\text{total}} = \text{NF}_1 + \frac{\text{NF}_2 - 1}{G_1} \quad \text{(linear units)}$$

In dB:

$$\text{NF}_{\text{total,dB}} = 10\log_{10}\!\left(10^{\text{NF}_{1}/10} + \frac{10^{\text{NF}_{2}/10} - 1}{10^{G_{1}/10}}\right)$$

> **v2 Correction:** The v1 linear-units formula had `NF2 / G1` instead of `(NF2 - 1) / G1`, and the dB formula had `NF2 - G1` in the exponent instead of converting properly. The correct Friis cascade formula [[9]](#ref-9) subtracts 1 from the second-stage noise figure (in linear units) before dividing by the first-stage gain.

<details><summary>Pseudo Code</summary>

```python
def cascaded_nf(nf1_db, nf2_db, g1_db):
    """Cascaded noise figure of a dual-stage amplifier (Friis formula, dB)."""
    nf1_lin = 10 ** (nf1_db / 10)
    nf2_lin = 10 ** (nf2_db / 10)
    g1_lin = 10 ** (g1_db / 10)
    return 10 * log10(nf1_lin + (nf2_lin - 1) / g1_lin)
```

</details>

### 5.4 Gain Profile, Tilt, and Ripple

Real EDFAs do not have perfectly flat gain across frequency:

- **Gain Ripple:** Fixed spectral variation inherent to the EDFA design (dB vs frequency).
- **Dynamic Gain Tilt (DGT):** Gain slope that varies with the amplifier operating point.
- **NF Ripple:** Frequency-dependent noise figure variation.
- **VOA (Variable Optical Attenuator):** Input/output attenuators for power management.

The effective gain at each frequency:

$$G(f) = G_{\text{flatmax}} + \text{ripple}(f) + \text{DGT}(f) \times s - \text{VOA}$$

where $s$ is a scaling factor derived from the tilt target setting.

<details><summary>Pseudo Code</summary>

```python
def gain_profile(g_flatmax, ripple_f, dgt_f, scale, voa):
    """Effective EDFA gain at frequency f (dB)."""
    return g_flatmax + ripple_f + dgt_f * scale - voa
```

</details>

```mermaid
flowchart LR
    A["Signal In<br/>(per-channel powers)"] --> B["Input VOA"]
    B --> C["Erbium Gain Medium<br/>+ Gain Profile"]
    C --> D["Output VOA"]
    D --> E["Signal Out<br/>(amplified)"]

    C -.-> F["ASE Noise Added<br/>P_ASE = 2·nsp·(G-1)·h·f·B"]
    C -.-> G["Gain = Ripple + DGT - VOA"]

    style C fill:#1e40af,color:#fff
    style F fill:#ef4444,color:#fff
    style G fill:#f59e0b,color:#000
```

### 5.5 Raman Amplification

Distributed Raman amplification uses the transmission fiber itself as the gain medium by injecting pump lasers (typically at ~1450 nm for C-band amplification).

**Advantages over EDFA-only:**
- Lower effective noise figure (gain occurs where signal power is lowest)
- More uniform power profile along the fiber
- Extended reach between amplifier sites

**Configurations:**
- **Counter-propagating pumps:** Most common; pump travels opposite to signal. Lower noise.
- **Co-propagating pumps:** Pump travels with signal. Can cause noise transfer from pump RIN.
- **Hybrid Raman + EDFA:** Raman provides partial gain, EDFA provides the remainder.

---

## 6. Signal Quality Metrics

### 6.1 Signal-to-Noise Ratio (SNR)

The fundamental quality metric: the ratio of signal power to noise power within the signal bandwidth.

$$\text{SNR} = \frac{P_{\text{signal}}}{P_{\text{noise}}}$$

In optical systems, noise has two primary components:
- **ASE noise** from amplifiers
- **NLI noise** from fiber nonlinearity

### 6.2 OSNR (Optical Signal-to-Noise Ratio)

OSNR is the industry-standard metric, normalized to a 0.1 nm reference bandwidth (~12.5 GHz at 1550 nm, per ITU-T G.697 [[12]](#ref-12)):

$$\text{OSNR}_{0.1\text{nm}} = \text{SNR}_{\text{signal BW}} - 10\log_{10}\!\left(\frac{12.5 \text{ GHz}}{B_{\text{signal}}}\right)$$

<details><summary>Pseudo Code</summary>

```python
def osnr_01nm(snr_signal_bw_db, baud_rate_hz):
    """Convert signal-bandwidth SNR to 0.1 nm OSNR."""
    return snr_signal_bw_db - 10 * log10(12.5e9 / baud_rate_hz)
```

</details>

This normalization allows comparison between signals with different baud rates. A 100G signal at 32 GBaud and a 400G signal at 64 GBaud can be compared on the same OSNR scale.

### 6.3 GSNR (Generalized Signal-to-Noise Ratio)

GSNR combines both ASE and NLI noise into a single metric [[5]](#ref-5). This is the "true" quality indicator for modern coherent systems:

$$\text{GSNR} = \frac{P_{\text{signal}}}{P_{\text{ASE}} + P_{\text{NLI}}}$$

Equivalently, using reciprocal addition:

$$\frac{1}{\text{GSNR}} = \frac{1}{\text{OSNR}_{\text{ASE}}} + \frac{1}{\text{OSNR}_{\text{NLI}}}$$

GSNR determines whether a given transceiver mode (modulation format) is feasible on a path.

<details><summary>Pseudo Code</summary>

```python
def gsnr(signal_power, ase_power, nli_power):
    """Generalized signal-to-noise ratio (linear)."""
    return signal_power / (ase_power + nli_power)
```

</details>

### 6.4 Cascaded SNR

When a signal passes through multiple independent noise sources, the total SNR is computed by adding noise powers (valid because the noise powers add linearly for independent sources) [[11]](#ref-11):

$$\frac{1}{\text{SNR}_{\text{total}}} = \frac{1}{\text{SNR}_1} + \frac{1}{\text{SNR}_2} + \cdots + \frac{1}{\text{SNR}_N}$$

In dB domain:

$$\text{SNR}_{\text{total,dB}} = -10\log_{10}\!\left(10^{-\text{SNR}_1/10} + 10^{-\text{SNR}_2/10} + \cdots\right)$$

This applies to cascading TX OSNR, per-span ASE/NLI contributions, and ROADM add/drop impairments.

<details><summary>Pseudo Code</summary>

```python
def cascaded_snr_db(snr_list_db):
    """Total SNR from cascaded noise sources (dB)."""
    inv_sum = sum(10 ** (-s / 10) for s in snr_list_db)
    return -10 * log10(inv_sum)
```

</details>

```mermaid
flowchart LR
    TX["TX OSNR<br/>(transmitter noise)"] --> S1["Span 1<br/>ASE + NLI"]
    S1 --> ROADM["ROADM<br/>add/drop OSNR"]
    ROADM --> S2["Span 2<br/>ASE + NLI"]
    S2 --> SN["···<br/>Span N"]
    SN --> RX["RX GSNR<br/>(final quality)"]

    RX --- EQ["1/GSNR = Σ 1/SNRᵢ"]

    style TX fill:#059669,color:#fff
    style RX fill:#ef4444,color:#fff
    style EQ fill:#f59e0b,color:#000
```

---

## 7. Network Elements

### 7.1 Element Overview

A DWDM network is modeled as a directed graph where each node is a network element. Each element transforms the optical signal passing through it. The core abstraction: every element is a callable that accepts a spectral information object and returns a modified version.

```mermaid
classDiagram
    class NetworkElement {
        +uid: string
        +name: string
        +metadata: dict
        +__call__(spectral_info) spectral_info
    }

    class Transceiver {
        +tx_osnr
        +penalties
        +compute_snr()
    }

    class Fiber {
        +loss_coef
        +dispersion
        +gamma
        +pmd_coef
        +propagate()
    }

    class RamanFiber {
        +raman_pumps
        +propagate()
    }

    class Edfa {
        +gain_target
        +noise_figure
        +p_max
        +noise_profile()
        +gain_profile()
    }

    class Roadm {
        +target_power
        +add_drop_osnr
        +equalize()
    }

    class Fused {
        +loss
        +propagate()
    }

    NetworkElement <|-- Transceiver
    NetworkElement <|-- Fiber
    NetworkElement <|-- Edfa
    NetworkElement <|-- Roadm
    NetworkElement <|-- Fused
    Fiber <|-- RamanFiber
```

### 7.2 Transceiver

The transceiver is the logical start and end point of a lightpath. At the transmitter side, it generates the WDM signal comb (SpectralInformation). At the receiver side, it computes final quality metrics.

**Transmitter outputs:**
- Per-channel power, frequency, baud rate, roll-off
- TX OSNR (models transmitter noise floor, typically 33-45 dB)

**Receiver computes:**
- GSNR (0.1 nm and signal bandwidth)
- OSNR (ASE-only and NLI-only)
- Accumulated CD, PMD, PDL, latency
- Impairment penalties (CD, PMD, PDL boundary violations)

### 7.3 Optical Fiber

The core propagation element. Applies multiple physical effects to the signal:

```mermaid
sequenceDiagram
    participant SI as Spectral Information
    participant F as Fiber Element

    SI->>F: Enter fiber span
    F->>SI: 1. Apply connector-in loss
    F->>F: 2. Compute Raman profiles (SRS)
    F->>F: 3. Compute NLI noise
    F->>SI: 4. Add NLI to noise budget
    F->>SI: 5. Accumulate CD
    F->>SI: 6. Accumulate PMD (RSS)
    F->>SI: 7. Add propagation latency
    F->>SI: 8. Apply fiber attenuation
    F->>SI: 9. Apply connector-out loss
    SI-->>F: Return modified signal
```

### 7.4 EDFA (Amplifier)

Compensates the loss of the preceding fiber span(s). Key behaviors:
- Applies frequency-dependent gain profile
- Adds ASE noise proportional to NF and gain
- Subject to output power saturation ($P_{\text{max}}$)
- May include input/output VOA for power management

**Amplifier selection during network design:** For each span, the design algorithm selects the amplifier type from the equipment library that provides the required gain with the lowest noise figure, while respecting output power constraints.

### 7.5 ROADM (Reconfigurable Optical Add-Drop Multiplexer)

The key switching and routing node in mesh DWDM networks. ROADMs have multiple degrees (directions) and support three signal paths:

```mermaid
graph TB
    subgraph ROADM
        direction TB
        EXP["Express Path<br/>(pass-through)<br/>Loss: ~16 dB"]
        ADD["Add Path<br/>(inject signal)<br/>Loss: ~11 dB"]
        DROP["Drop Path<br/>(extract signal)<br/>Loss: ~11 dB"]
    end

    WIN["West<br/>Ingress"] --> EXP
    EIN["East<br/>Ingress"] --> EXP
    EXP --> WOUT["West<br/>Egress"]
    EXP --> EOUT["East<br/>Egress"]

    LOCAL_TX["Local TX"] --> ADD
    ADD --> WOUT
    ADD --> EOUT

    WIN --> DROP
    EIN --> DROP
    DROP --> LOCAL_RX["Local RX"]

    style EXP fill:#2563eb,color:#fff
    style ADD fill:#059669,color:#fff
    style DROP fill:#ef4444,color:#fff
```

**Power equalization schemes** (applied at each egress degree):

> **Clarification:** The following three schemes are commonly used in DWDM planning tools and are listed here as representative examples. The literature does not standardize on a single canonical set of three equalization strategies — implementations may support additional or alternative schemes.

| Scheme | Target | Formula | Use Case |
|--------|--------|---------|----------|
| Fixed power | Same absolute power per channel | $P_{\text{out}} = P_{\text{target}}$ (dBm) | Simple, legacy |
| Constant PSD | Same power spectral density | $P_{\text{out}} = B \times \text{PSD}$ | Mixed baud rates |
| Per-slot width | Power proportional to slot width | $P_{\text{out}} = W_{\text{slot}} \times \text{PSW}$ | Flexible grid |

**ROADM impairments per path type:**
- Insertion loss (dB)
- PMD (ps)
- PDL (dB)
- Chromatic dispersion (ps/nm)
- In-band crosstalk (dB)
- OSNR degradation (add/drop OSNR)

### 7.6 Fused (Passive Coupler)

A simple passive loss element modeling couplers, splitters, or inline connectors. Applies flat attenuation with no noise contribution.

---

## 8. Spectral Information Model

### 8.1 Data Structure

The spectral information object carries all per-channel signal properties as the signal traverses the network:

```mermaid
classDiagram
    class SpectralInformation {
        frequency[] : Hz
        baud_rate[] : Hz
        slot_width[] : Hz
        roll_off[] : dimensionless
        pch[] : W -- total channel power
        signal_ratio[] : fraction of pch
        ase_ratio[] : fraction of pch
        nli_ratio[] : fraction of pch
        chromatic_dispersion[] : s/m
        pmd[] : s
        pdl[] : dB
        latency[] : s
        tx_osnr[] : dB
        ---
        signal = signal_ratio × pch
        ase = ase_ratio × pch
        nli = nli_ratio × pch
        ---
        SNR = signal_ratio / ase_ratio
        GSNR = signal_ratio / (ase_ratio + nli_ratio)
    }
```

### 8.2 Signal-Noise Ratio Tracking

Power is decomposed into three components via ratios that sum to 1:

$$\mathrm{signal\_ratio} + \mathrm{ase\_ratio} + \mathrm{nli\_ratio} = 1$$

**When NLI is added** (fiber nonlinearity generates noise):

The NLI fraction is computed and all existing ratios are scaled down proportionally:
```
nli_added_ratio = nli_power / pch
signal_ratio *= (1 - nli_added_ratio)
ase_ratio    *= (1 - nli_added_ratio)
nli_ratio     = nli_ratio * (1 - nli_added_ratio) + nli_added_ratio
```

<details><summary>Pseudo Code</summary>

```python
def add_nli(signal_ratio, ase_ratio, nli_ratio, nli_power, pch):
    """Update power ratios when NLI noise is added."""
    nli_added = nli_power / pch
    return (signal_ratio * (1 - nli_added),
            ase_ratio * (1 - nli_added),
            nli_ratio * (1 - nli_added) + nli_added)
```

</details>

**When ASE is added** (amplifier noise):

Total power increases; signal and NLI ratios decrease:
```
pch_new       = pch + ase_added
signal_ratio *= pch / pch_new
nli_ratio    *= pch / pch_new
ase_ratio     = (ase_ratio * pch + ase_added) / pch_new
pch           = pch_new
```

<details><summary>Pseudo Code</summary>

```python
def add_ase(signal_ratio, ase_ratio, nli_ratio, pch, ase_added):
    """Update power ratios when ASE noise is added."""
    pch_new = pch + ase_added
    scale = pch / pch_new
    return (signal_ratio * scale,
            (ase_ratio * pch + ase_added) / pch_new,
            nli_ratio * scale,
            pch_new)
```

</details>

**When gain or attenuation is applied:**

Total power scales up or down; ratios remain unchanged. This preserves the SNR through passive and amplifying elements (only noise addition degrades SNR).

---

## 9. Network Design and Planning

### 9.1 Network Topology

A DWDM network is represented as a directed graph:
- **Nodes:** Network element instances (Transceiver, ROADM, Fiber, EDFA, Fused)
- **Edges:** Physical connectivity with distance-based weights for routing

An **OMS (Optical Multiplex Section)** is the set of elements between two adjacent ROADMs (or between a Transceiver and a ROADM). Each OMS has an independent spectrum allocation.

```mermaid
graph LR
    T1["Transceiver A"] --> R1["ROADM 1"]
    R1 --> |"OMS 1"| F1["Fiber"]
    F1 --> A1["EDFA"]
    A1 --> F2["Fiber"]
    F2 --> R2["ROADM 2"]
    R2 --> |"OMS 2"| F3["Fiber"]
    F3 --> A2["EDFA"]
    A2 --> F4["Fiber"]
    F4 --> R3["ROADM 3"]
    R3 --> T2["Transceiver B"]

    R2 --> |"OMS 3"| F5["Fiber"]
    F5 --> A3["EDFA"]
    A3 --> F6["Fiber"]
    F6 --> R4["ROADM 4"]

    style R1 fill:#7c3aed,color:#fff
    style R2 fill:#7c3aed,color:#fff
    style R3 fill:#7c3aed,color:#fff
    style R4 fill:#7c3aed,color:#fff
    style T1 fill:#059669,color:#fff
    style T2 fill:#059669,color:#fff
```

### 9.2 Network Design Pipeline

```mermaid
flowchart TD
    A["1. Load Equipment Library<br/>(amplifier types, fiber types, ROADM specs)"] --> B["2. Load Network Topology<br/>(nodes, links, fiber parameters)"]
    B --> C["3. Add Missing Elements"]
    C --> D["4. Build Network<br/>(set defaults, connector losses)"]
    D --> E["5. Design Network<br/>(amplifier selection, gain targets)"]
    E --> F["6. Ready for Propagation"]

    C --> C1["Split long fibers<br/>(> max_length)"]
    C --> C2["Insert ROADM pre/post amps"]
    C --> C3["Insert inline amplifiers<br/>between fiber spans"]

    E --> E1["For each amplifier site:"]
    E1 --> E2["Compute span loss"]
    E2 --> E3["Set gain target =<br/>span_loss + delta_p"]
    E3 --> E4["Select amp type<br/>(minimize NF)"]
    E4 --> E5["Check power constraints<br/>(P_out ≤ P_max)"]

    style A fill:#1e40af,color:#fff
    style F fill:#059669,color:#fff
```

### 9.3 Amplifier Placement and Selection

**Span loss computation:**

$$L_{\text{span}} = \sum_{\text{fibers}} L_{\text{fiber}} + \sum_{\text{fused}} L_{\text{fused}} - \sum_{\text{raman}} G_{\text{raman}}$$

<details><summary>Pseudo Code</summary>

```python
def span_loss(fiber_losses, fused_losses, raman_gains):
    """Total span loss in dB."""
    return sum(fiber_losses) + sum(fused_losses) - sum(raman_gains)
```

</details>

**Gain target:**

$$G_{\text{target}} = L_{\text{span}} + \Delta P + \text{VOA}_{\text{prev}}$$

**Selection criteria** (from equipment library):
1. Gain range: $G_{\text{min}} \leq G_{\text{target}} \leq G_{\text{max}}$
2. Output power: $P_{\text{out}} \leq P_{\text{max}}$
3. Minimize noise figure at the target gain

### 9.4 Path Computation

Paths are computed using shortest-path algorithms (Dijkstra) over the network graph, with optional constraints:

- **Strict nodes:** Path must traverse specific ROADMs/nodes
- **Loose nodes:** Path should traverse specific nodes if possible
- **Link-diverse:** Multiple paths must not share fiber links
- **Node-diverse:** Multiple paths must not share ROADM nodes

### 9.5 Spectrum Assignment

Spectrum slots are assigned using a bitmap per OMS:

**Slot index from frequency:**

$$n = \left\lfloor\frac{f - 193.1 \text{ THz}}{6.25 \text{ GHz}}\right\rfloor$$

**Number of slots needed for a channel:**

$$M = \left\lceil\frac{\text{channel spacing}}{12.5 \text{ GHz}}\right\rceil$$

<details><summary>Pseudo Code</summary>

```python
def frequency_to_slot(freq_hz):
    """ITU-T slot index from frequency."""
    return int((freq_hz - 193.1e12) / 6.25e9)

def slots_needed(channel_spacing_hz):
    """Number of 12.5 GHz slots for a channel."""
    from math import ceil
    return ceil(channel_spacing_hz / 12.5e9)
```

</details>

**First-fit algorithm [[16]](#ref-16):** Scan the bitmap from the lowest frequency and assign the first contiguous block of $M$ free slots. This is simple and efficient but can lead to fragmentation.

---

## 10. Transceiver Modes and Modulation Formats

### 10.1 Coherent Detection

Modern DWDM systems use **coherent detection** with digital signal processing (DSP). Key features:
- **Dual-polarization (DP):** Two independent data streams on orthogonal polarizations, doubling spectral efficiency.
- **In-phase/Quadrature (IQ):** Encodes information in both amplitude and phase of the optical field.
- **DSP compensation:** Chromatic dispersion, PMD, and other linear impairments are compensated digitally at the receiver.

### 10.2 Common Modulation Formats

| Format | Bits/Symbol | Typical Baud Rate | Bit Rate | Required OSNR | Relative Reach |
|--------|-------------|-------------------|----------|---------------|----------------|
| DP-QPSK | 4 | 32 GBaud | 100 Gbps | ~12 dB | Long (transoceanic) |
| DP-8QAM | 6 | 42 GBaud | 200 Gbps | ~17 dB | Medium-long |
| DP-16QAM | 8 | 32 GBaud | 200 Gbps | ~19 dB | Medium |
| DP-16QAM | 8 | 64 GBaud | 400 Gbps | ~19 dB | Medium |
| DP-64QAM | 12 | 64 GBaud | 600 Gbps | ~25 dB | Short (metro) |

**Bit rate formula [[3]](#ref-3):**

$$R_b = B_{\text{symbol}} \times \log_2(M) \times N_{\text{pol}}$$

where:
- $R_b$ = bit rate (bps)
- $B_{\text{symbol}}$ = symbol rate / baud rate (Baud)
- $M$ = constellation order (4 for QPSK, 16 for 16QAM, etc.)
- $N_{\text{pol}}$ = number of polarizations (2 for DP)

<details><summary>Pseudo Code</summary>

```python
def bit_rate(baud, constellation_order, n_pol=2):
    """Bit rate from symbol rate and modulation format."""
    return baud * log2(constellation_order) * n_pol
```

</details>

### 10.3 Shannon Capacity Limit

The theoretical maximum information rate for a given SNR (dual-polarization) [[10]](#ref-10)[[11]](#ref-11):

$$C = 2 B_{\text{symbol}} \log_2(1 + \text{SNR})$$

The factor of 2 accounts for dual-polarization transmission, effectively doubling the capacity of the single-polarization Shannon formula $C = B \log_2(1 + \text{SNR})$ [[10]](#ref-10).

Practical systems achieve within 1-3 dB of the Shannon limit. The gap is the **implementation penalty** [[11]](#ref-11).

<details><summary>Pseudo Code</summary>

```python
def shannon_capacity(baud, snr_linear):
    """Dual-polarization Shannon capacity (bps)."""
    return 2 * baud * log2(1 + snr_linear)
```

</details>

### 10.4 Feasibility and System Margin

A transceiver mode is feasible on a path if:

$$\text{GSNR}_{\text{received}} \geq \text{GSNR}_{\text{required}} + \text{Penalty}_{\text{CD}} + \text{Penalty}_{\text{PMD}} + \text{Penalty}_{\text{PDL}} + \text{Margin}_{\text{system}}$$

<details><summary>Pseudo Code</summary>

```python
def is_feasible(gsnr_rx_db, gsnr_req_db, penalties_db, margin_db):
    """Check if transceiver mode is feasible on path."""
    return gsnr_rx_db >= gsnr_req_db + sum(penalties_db) + margin_db
```

</details>

**Mode selection strategy:** Choose the highest-capacity format whose required GSNR (plus penalties and margins) can be met by the path. This maximizes throughput while ensuring reliability.

---

## 11. End-to-End Propagation Simulation

### 11.1 Signal Propagation Flow

A complete simulation walks the signal through every element in the path sequentially:

```mermaid
sequenceDiagram
    participant TX as Transceiver (TX)
    participant R1 as ROADM 1
    participant F1 as Fiber Span
    participant E1 as EDFA
    participant F2 as Fiber Span
    participant R2 as ROADM 2
    participant RX as Transceiver (RX)

    TX->>TX: Create SpectralInformation
    TX->>R1: Power equalization + add OSNR
    R1->>F1: Attenuation + CD + PMD + NLI
    F1->>E1: ASE noise + gain
    E1->>F2: Attenuation + CD + PMD + NLI
    F2->>R2: Power equalization + express OSNR
    R2->>RX: Final GSNR, OSNR, penalties

    Note over TX: Sets initial power,<br/>TX OSNR, channel grid
    Note over F1: P_NLI, CD, PMD accumulate
    Note over E1: P_ASE added, loss compensated
    Note over RX: Computes feasibility:<br/>GSNR ≥ required + penalties
```

### 11.2 Multi-Span Link Budget Example

Consider a 3-span link with SSMF fiber, 80 km spans, 0.2 dB/km loss, EDFA with 6 dB NF:

| Point | Element | Action | P_ch (dBm) | OSNR (dB) | Notes |
|-------|---------|--------|------------|-----------|-------|
| 0 | TX | Launch | 0.0 | 45.0 | TX OSNR limit |
| 1 | Fiber 1 | -16 dB loss | -16.0 | 45.0 | 80 km × 0.2 dB/km |
| 2 | EDFA 1 | +16 dB gain | 0.0 | 35.2 | NF=6 dB, ASE added |
| 3 | Fiber 2 | -16 dB loss | -16.0 | 35.2 | |
| 4 | EDFA 2 | +16 dB gain | 0.0 | 32.1 | Cascaded ASE |
| 5 | Fiber 3 | -16 dB loss | -16.0 | 32.1 | |
| 6 | EDFA 3 | +16 dB gain | 0.0 | 30.3 | |
| 7 | RX | Receive | 0.0 | ~30.0 | After all penalties |

Each EDFA adds ASE noise proportional to $(\text{NF} \cdot G - 1) \cdot h \cdot f \cdot B_{\text{ref}}$ [[8]](#ref-8) (in 0.1 nm bandwidth). The OSNR degrades span by span following the cascaded SNR formula.

---

## 12. Reference Tables and Constants

### 12.1 Physical Constants

| Constant | Symbol | Value | Unit |
|----------|--------|-------|------|
| Speed of light (vacuum) | $c$ | $2.998 \times 10^8$ | m/s |
| Planck's constant | $h$ | $6.626 \times 10^{-34}$ | J$\cdot$s |
| Boltzmann's constant | $k_B$ | $1.381 \times 10^{-23}$ | J/K |
| Nonlinear refractive index (silica) | $n_2$ | $\sim 2.6 \times 10^{-20}$ | m$^2$/W |
| OSNR reference bandwidth (0.1 nm) | $B_{\text{ref}}$ | 12.5 | GHz |
| C-band anchor frequency (ITU-T) | $f_0$ | 193.1 | THz |

### 12.2 Typical Fiber Parameters [[3]](#ref-3)[[17]](#ref-17)

| Parameter | SSMF (G.652) | NZDF (G.655) | LEAF | Unit |
|-----------|-------------|-------------|------|------|
| Attenuation (1550 nm) | 0.2 | 0.22 | 0.2 | dB/km |
| Dispersion (1550 nm) | 17 | 4.5 | 4.2 | ps/(nm$\cdot$km) |
| Dispersion slope | 0.058 | 0.045 | 0.045 | ps/(nm$^2\cdot$km) |
| Effective area | 80 | 55 | 72 | $\mu$m$^2$ |
| PMD coefficient | 0.04 | 0.04 | 0.04 | ps/$\sqrt{\text{km}}$ |
| Nonlinear coefficient $\gamma$ | 1.3 | 1.9 | 1.5 | (W$\cdot$km)$^{-1}$ |

### 12.3 Unit Conversion Quick Reference

| From | To | Formula |
|------|----|---------|
| dBm | mW | $10^{x/10}$ |
| mW | dBm | $10\log_{10}(x)$ |
| dBm | W | $10^{(x-30)/10}$ |
| dB | linear ratio | $10^{x/10}$ |
| linear ratio | dB | $10\log_{10}(x)$ |
| THz | nm (at 1550 nm) | $\lambda = c / f$ |
| ps/(nm$\cdot$km) | s/m$^2$ | $\times 10^{-6}$ |
| dB/km | Np/m | $\div 4343$ |

### 12.4 Formula Index

| Formula | Section | Description |
|---------|---------|-------------|
| $f = c / \lambda$ | 1.3 | Frequency-wavelength relation |
| $P_{\text{dBm}} = 10\log_{10}(P_{\text{mW}})$ | 1.4 | Power conversion |
| $P(z) = P_0 e^{-\alpha z}$ | 2.1 | Fiber attenuation |
| $\beta_2 = -(c/f)^2 D / (2\pi c)$ | 2.2 | Dispersion parameter |
| $\Delta\tau = \text{PMD} \cdot \sqrt{L}$ | 2.3 | PMD accumulation |
| $\gamma = 2\pi f n_2 / (c A_{\text{eff}})$ | 2.5 | Nonlinear coefficient |
| $L_{\text{eff}} = (1 - e^{-\alpha L}) / \alpha$ | 2.6 | Effective length |
| $P_{\text{NLI}} = \sum P_c P_p^2 \eta$ | 3.2 | GN model NLI |
| $c_r = \gamma_R \cdot f_i / A_{\text{eff}}$ | 4.1 | Raman coupling |
| $P_{\text{ASE}} = 2 n_{sp} (G-1) h f B$ | 5.2 | Amplifier ASE noise [[8]](#ref-8) |
| $\text{NF}_{\text{cascade}} = \text{NF}_1 + (\text{NF}_2 - 1)/G_1$ | 5.3 | Cascaded noise figure (Friis) [[9]](#ref-9) |
| $\text{GSNR} = P_s / (P_{\text{ASE}} + P_{\text{NLI}})$ | 6.3 | Generalized SNR |
| $1/\text{SNR}_T = \sum 1/\text{SNR}_i$ | 6.4 | Cascaded SNR |
| $R_b = B \cdot \log_2(M) \cdot N_p$ | 10.2 | Bit rate |
| $C = 2B\log_2(1 + \text{SNR})$ | 10.3 | Shannon capacity |

---

## 13. Glossary

| Term | Definition |
|------|-----------|
| **ASE** | Amplified Spontaneous Emission. Noise generated by optical amplifiers. |
| **Baud Rate** | Symbol rate; number of symbols transmitted per second (GBaud). |
| **Beta2 ($\beta_2$)** | Group velocity dispersion parameter (s$^2$/m). |
| **C-Band** | Conventional band, 1530-1565 nm (~191-196 THz). Primary DWDM window. |
| **CD** | Chromatic Dispersion. Wavelength-dependent propagation delay causing pulse broadening. |
| **CUT** | Channel Under Test. The channel for which NLI is being computed. |
| **DGT** | Dynamic Gain Tilt. Wavelength-dependent gain variation in EDFAs. |
| **DP** | Dual Polarization. Using both orthogonal polarization states to carry data. |
| **DWDM** | Dense Wavelength Division Multiplexing. |
| **EDFA** | Erbium-Doped Fiber Amplifier. |
| **Flexi-Grid** | ITU-T G.694.1 flexible frequency grid with variable channel widths. |
| **FWM** | Four-Wave Mixing. Nonlinear effect generating new frequency components. |
| **GGN** | Generalized Gaussian Noise model. Extended NLI model with spectral shaping. |
| **GN Model** | Gaussian Noise model. Treats NLI as additive Gaussian noise. |
| **GSNR** | Generalized Signal-to-Noise Ratio. Includes both ASE and NLI noise. |
| **ITU-T** | International Telecommunication Union - Telecommunication sector. |
| **L-Band** | Long-wavelength band, 1565-1625 nm (~184-191 THz). |
| **NF** | Noise Figure. Ratio of input SNR to output SNR of an amplifier (dB). |
| **NLI** | Nonlinear Interference. Noise from fiber Kerr nonlinearity. |
| **OMS** | Optical Multiplex Section. Fiber path between two adjacent ROADM nodes. |
| **OSNR** | Optical Signal-to-Noise Ratio. Measured in 0.1 nm reference bandwidth. |
| **PDL** | Polarization Dependent Loss. Max-to-min transmission ratio. |
| **PMD** | Polarization Mode Dispersion. Differential delay between polarization modes. |
| **PSD** | Power Spectral Density. Power per unit frequency (mW/GHz). |
| **ROADM** | Reconfigurable Optical Add-Drop Multiplexer. |
| **SNR** | Signal-to-Noise Ratio. |
| **SPM** | Self-Phase Modulation. A channel's own intensity modulating its phase. |
| **SRS** | Stimulated Raman Scattering. Power transfer between wavelengths. |
| **SSMF** | Standard Single-Mode Fiber (ITU-T G.652). |
| **VOA** | Variable Optical Attenuator. |
| **WDM** | Wavelength Division Multiplexing. |
| **XPM** | Cross-Phase Modulation. Other channels modulating a channel's phase. |

---

*This knowledge base covers the core physics, engineering principles, and system-level concepts underlying DWDM optical networking. All formulas use standard notation from the optical communications literature.*

---

## 14. References

<a id="ref-1"></a>**[1]** ITU-T Recommendation G.694.1, "Spectral grids for WDM applications: DWDM frequency grid," International Telecommunication Union, 2020.

<a id="ref-2"></a>**[2]** Beer-Lambert Law (fiber attenuation). See also: Agrawal, G.P., *Nonlinear Fiber Optics*, 6th ed., Academic Press, 2019, Chapter 1.

<a id="ref-3"></a>**[3]** Agrawal, G.P., *Nonlinear Fiber Optics*, 6th ed., Academic Press, 2019. (Covers chromatic dispersion, nonlinear coefficient, effective length, Raman scattering, and modulation formats.)

<a id="ref-4"></a>**[4]** Wikipedia, "Polarization mode dispersion," https://en.wikipedia.org/wiki/Polarization_mode_dispersion. (PMD formula: differential group delay scales as square root of fiber length.)

<a id="ref-5"></a>**[5]** Poggiolini, P., "The GN Model of Non-Linear Propagation in Uncompensated Coherent Optical Systems," *Journal of Lightwave Technology*, vol. 30, no. 24, pp. 3857–3879, Dec. 2012.

<a id="ref-6"></a>**[6]** Poggiolini, P. et al., "A Detailed Analytical Derivation of the GN Model of Non-Linear Interference in Coherent Optical Transmission Systems," arXiv:1209.0394, 2012.

<a id="ref-7"></a>**[7]** Carena, A. et al., "EGN model of non-linear fiber propagation," *Optics Express*, vol. 22, no. 13, pp. 16335–16362, 2014.

<a id="ref-8"></a>**[8]** Desurvire, E., *Erbium-Doped Fiber Amplifiers: Principles and Applications*, Wiley-Interscience, 2002. (EDFA ASE noise formula: $P_{\text{ASE}} = 2 n_{sp} (G-1) h f B$.)

<a id="ref-9"></a>**[9]** Friis, H.T., "Noise Figures of Radio Receivers," *Proceedings of the IRE*, vol. 32, no. 7, pp. 419–422, July 1944. (Cascade noise figure formula: $\text{NF}_{\text{total}} = \text{NF}_1 + (\text{NF}_2 - 1)/G_1$.)

<a id="ref-10"></a>**[10]** Shannon, C.E., "A Mathematical Theory of Communication," *Bell System Technical Journal*, vol. 27, pp. 379–423, 623–656, July & October 1948.

<a id="ref-11"></a>**[11]** Essiambre, R.-J. et al., "Capacity Limits of Optical Fiber Networks," *Journal of Lightwave Technology*, vol. 28, no. 4, pp. 662–701, Feb. 2010. (Dual-polarization Shannon limit and cascaded SNR.)

<a id="ref-12"></a>**[12]** ITU-T Recommendation G.697, "Optical monitoring for dense wavelength division multiplexing systems," International Telecommunication Union. (OSNR measured with 0.1 nm reference bandwidth, ~12.5 GHz at 1550 nm.)

<a id="ref-13"></a>**[13]** D'Amico, A. et al., "Perturbative Solution of Inter-Channel Stimulated Raman Scattering in Wideband WDM Transmission Systems," arXiv:2304.11756, 2023.

<a id="ref-14"></a>**[14]** Stolen, R.H. and Ippen, E.P., "Raman gain in glass optical waveguides," *Applied Physics Letters*, vol. 22, no. 6, pp. 276–278, 1973.

<a id="ref-15"></a>**[15]** Christodoulides, D.N. and Jander, R.B., "Evolution of stimulated Raman crosstalk in wavelength division multiplexed systems," *IEEE Photonics Technology Letters*, vol. 8, no. 12, pp. 1722–1724, 1996.

<a id="ref-16"></a>**[16]** Jinno, M. et al., "Spectrum-Efficient and Scalable Elastic Optical Path Network: Architecture, Benefits, and Enabling Technologies," *IEEE Communications Magazine*, vol. 47, no. 11, pp. 66–73, Nov. 2009.

<a id="ref-17"></a>**[17]** ITU-T Recommendation G.652, "Characteristics of a single-mode optical fibre and cable," International Telecommunication Union.
