# Research notes and design choices

This file summarises the literature the model is built on and the choices made
for a piano that runs in real time in a browser AudioWorklet. Numbers quoted for
our implementation are measured; see `docs/CALIBRATION.md` and
`docs/PERFORMANCE.md`.

## 1. Families of piano models

| approach | what it is | real-time? | why (not) here |
|---|---|---|---|
| Finite differences / energy-consistent schemes (Chaigne & Askenfelt 1994; Bensa et al. 2003; Chabassier, Chaigne & Joly 2013) | Discretise the stiff, damped string PDE (Chabassier: geometrically exact, with longitudinal waves), hammer, 3-D soundboard and air | No — Chabassier's full grand runs far slower than real time on clusters | The physical reference. We borrow its parameter ranges and its insistence on energy-consistent coupling. |
| Digital waveguides (Smith 1992; Van Duyne & Smith 1994; Bank 2000) | Travelling waves in delay lines; losses and stiffness lumped into loop filters | Yes, cost independent of partial count | **Chosen for strings.** |
| Commuted synthesis (Smith & Van Duyne 1995) | Soundboard/body impulse response is *commuted* into the hammer excitation table; strings driven by it | Yes, very cheap | Rejected as the main structure. It needs the body to be LTI and separate per note, so strings cannot share and push back on one soundboard. That rules out sympathetic resonance through the bridge and a live soundboard-damping control. |
| Modal synthesis (Bank, Zambon & Fontana 2010) | Each partial a 2nd-order resonator, hammer acting on the modal sum | Yes, cost grows with the number of partials (hundreds in the bass) | Very calibratable. We keep its idea of matching each partial frequency exactly, but do it inside the waveguide loop filter. We use modal synthesis **for the soundboard**. |

## 2. Strings

* **Waveguide loop.** Each string is one circular buffer holding the whole round
  trip. The agraffe inversion is applied at the bridge read, so the hammer and
  any preparation act as *in-place* scattering at interior taps (Smith 1992;
  Van Duyne, Pierce & Smith 1994). Loop filters are lumped at the bridge.
* **Stiffness and dispersion.** Partials follow f_k = k f₀ √(1 + B k²)
  (Fletcher 1964). The loop needs a phase delay that falls with frequency.
  * We first tried a cascade of identical first-order allpasses (Van Duyne & Smith 1994;
    Rauhala & Välimäki 2006). Its Lorentzian-shaped group delay cannot follow the
    stiff-string curve over a wide band: 57 cents RMS error at A0 with 24 sections.
  * We then tried least-squares phase design (Lang & Laakso 1994, as used by Bank 2000).
    It was excellent from the tenor up (C4: 0.17 cents RMS with order 3), but
    ill-conditioned at the orders the bass needs.
  * **Choice:** a cascade of 2nd-order allpass sections, initially placed after
    Abel, Välimäki & Smith (2010). One pole pair goes at each odd-π crossing of
    the desired lag, which has its linear part removed so the delay line carries
    the bulk delay. The poles are then refined by Levenberg–Marquardt on the true
    partial-frequency error in cents, with an analytic Jacobian.
  * Result: ≤ 0.05 cents for every fitted partial up to 3–5 kHz, from A♯0 to C8.
    A0 is ≈ 2 cents RMS, because 37 sections is above the refinement cap. Order
    ranges from ≈ 37 sections at A0 to 1–2 in the treble. All 88 keys design in
    ≈ 0.35 s.
  * The intrinsic order is set by physics: it equals the number of "lost cycles"
    of phase over the band, k(f_c) − f_c·dk/df.
* **Tuning.** An integer delay plus a 1st-order Thiran fractional delay (Laakso
  et al. 1996) makes the loop phase delay at partial 1 equal fs/f₁ exactly. The
  bridge is not rigid: its admittance shifts partials by up to −20 cents in the
  bass. We compute the reflection phase of each key's in-phase mode from the
  actual discrete soundboard model and pre-compensate it, averaged over partials
  1–6 (bass pitch is heard on the upper partials).
* **Stretch tuning.** Octaves are tuned the way an aural tuner would, from each
  key's B (Railsback stretch). The temperament octave A3–A4 is equal-tempered;
  above it partial 1 matches partial 2 of the octave below; below it we use
  2:1, 4:2 and 6:3 octaves going down. Stretch is ≈ +28 cents at C8 and ≈ −15
  cents at A0.
* **Losses.** A one-pole loss filter is fitted, in the log-magnitude least-squares
  sense, to per-partial decay targets σ(f) = σ₀ + σ₂ f² (the frequency dependence
  of Chaigne & Askenfelt's FD model; Bank 2000). The targets come from the
  reference analysis.
* **Unisons.** Two or three strings per key, slightly detuned, all ending on the
  same bridge point. The **double decay and beating** are not added on; they
  emerge from the coupling (Weinreich 1977):
  * the in-phase mode pushes the bridge and decays fast;
  * the antisymmetric modes barely load it and give the long aftersound.

  Hammer voicing irregularity (±5 % per string) seeds the antisymmetric modes.
* **Longitudinal / phantom partials** (Conklin 1999; Bank & Sujbert 2005). Tension
  modulation drives longitudinal motion in proportion to the squared slope. We
  approximate the bridge-end slope² by (F_bridge/T)². That term contains every
  sum and difference frequency of the transverse partials. It is filtered by the
  first two longitudinal resonances (≈16·f₁ for wound strings, c_L/2L for plain
  wire) and injected as a force on the soundboard. It is quadratic in amplitude,
  so it only matters at forte in the bass, which is what the measurements show.
  This is an approximation: no longitudinal waveguide.
* **Polarisation.** Only the vertical polarisation is modelled. Single bass strings
  therefore show no double decay from polarisation coupling, unlike a real piano.
  That would double the cost of those strings.

## 3. Hammer

* Power-law felt with hysteresis in the Hunt–Crossley form,
  F = K·xᵖ·(1 + λ·ẋ) (Hunt & Crossley 1975). It captures what Stulov's (1995)
  relaxation model is for: a stiffer response while compressing than while
  releasing, so brighter tone at higher velocity. Giordano & Winans (2000)
  measured p ≈ 2.2–3.5 and discuss when a power law is adequate.
* Mass, exponent, stiffness and strike position vary by register, after Conklin
  (1996) and Chaigne & Askenfelt (1994): ≈ 11 g → 5 g, p 2.3 → 3.1,
  β = 1/8 → 1/15.
* **Solver.** Hammer and string displacement use trapezoidal integration. The
  2–3 contact forces of a unison are solved jointly each sample by Newton's
  method. The Jacobian is diagonal plus rank-one, inverted by Sherman–Morrison,
  so the delay-free loop that explicit waveguide-hammer schemes must break
  (Borin, De Poli & Rocchesso 2000) never arises.
* Measured contact durations: ≈ 4 ms at A0, 2–2.5 ms at C4, < 1 ms at C8, all
  shortening with velocity. Askenfelt & Jansson (1990, 1991) report the same
  trend and magnitudes.
* Travel time from key to string is not modelled. The hammer launches 0.4 mm
  from the string, so latency stays at the audio buffer.
* **Una corda.** The action shift removes the third string of trichords from the
  hammer (it still rings sympathetically through the bridge) and lowers felt
  stiffness by up to 30 %.
* **Key/frame thump.** A short force pulse into the soundboard when the key
  bottoms, amplitude ∝ v_h^1.5. A smaller one on release.

## 4. Bridge and soundboard

* **Junction.** All undamped strings of all keys meet one passive junction. Each
  key's bridge point moves with the soundboard velocity of its zone plus a local
  resistive admittance (the infinite-plate high-frequency asymptote; Cremer).
  The soundboard is modal (Ege, Boutillon & Rébillat 2013 found it nearly linear,
  with roughly constant modal density and loss factors of a few percent below
  ≈1 kHz). The seed has ≈150 modes between 48 Hz and 3.2 kHz, η ≈ 2 → 3.5 %.
* **Three zones.** Modes are driven at three bridge zones: the bass bridge, low
  treble and high treble. A key's force is distributed over the zones, and modal
  shapes differ per zone, so registers excite different modes.
* **Solve.** Every sample, the junction is solved exactly with the soundboard's
  instantaneous term: a 3×3 system, rebuilt when the active-string set changes.
* **Stability.** Each mode is a positive-real velocity resonator discretised with
  the prewarped bilinear transform, which preserves passivity. Together with
  |loop filters| < 1 and a dissipative hammer, the whole coupled system is
  passive and therefore stable for every key and parameter. This is checked in
  the tests.
* **Coupling strength.** Measured driving-point impedances at the bridge are
  ~10³ kg/s (Giordano 1998; Conklin 1996b). Modal masses are chosen so the mean
  bridge mobility is ~1–3·10⁻⁴ s/kg. At the first attempt (≈10× too mobile)
  notes died in under a second and bass partials were pulled 20 cents flat.
* **Sympathetic resonance.** Struck notes are full voices. Every other undamped
  key — sustain pedal down, or the top 20 keys, which have no dampers — gets a
  cheap single waveguide with the combined impedance of its unison. It is
  connected to the **same** junction, so resonance happens through the physics,
  not through a reverb. This follows the measurements of Lehtonen et al. (2007);
  Zambon, Lehtonen & Bank (2008) is the cheaper filter-bank alternative.
* **Radiation.**
  * Two close "microphones" over the bass and treble strings take mode-shape-weighted
    sums of modal velocity, as the Iowa recordings were made.
  * The high-frequency local path is high-passed at 1.2 kHz and diffused by short allpasses.
  * A first-order radiation tilt and a fitted EQ account for radiation efficiency
    and microphone response.
  * The EQ is fitted to the long-term reference spectrum (honestly labelled as such).
* **Lid and room.** A lid shelf, plus an 8-line feedback delay network with
  frequency-dependent decay (Jot & Chaigne 1991). Both are listener-side and
  switchable; calibration renders are dry.

## 5. Dampers and pedals

* Each key has a damper contact c ∈ [0, 1]. The sustain pedal (CC64, continuous)
  lifts all dampers through a smooth contact curve, with a later lift-off for the
  heavier bass dampers. That gives **continuous half-pedalling**.
* Contact pressure interpolates the string loss filter towards a "damped" design.
  The damped targets are T60 ≈ 0.3 s at C4 for partial 1; bass dampers are less
  effective on low partials. Damping rate goes as c², so a light touch damps
  much less.
* Damper lift is fast (3 ms). Landing takes 12–42 ms, slower in the bass. When the
  felt lands on a vibrating string, a short noise burst is injected into the
  string at the hammer tap, so the release noise is pitched by the string itself.
* The top keys (F6 and up on the grand) have no dampers, like a real grand.
* Sostenuto (CC66) latches the dampers of keys held when it is pressed.

## 6. Real-time platform and the JS vs WASM decision

* Measured in Node 26 (same V8 as Chrome) on the Mac mini (Apple M5 Pro) — see
  `docs/PERFORMANCE.md`:
  * soundboard plus output stage: 2 % of one core;
  * each struck note: ≈ 0.2–0.3 %;
  * 88 simultaneous struck notes: 20 %;
  * 8 notes with the pedal down plus 80 sympathetic strings: 10 %.
* In Chrome the same scene reads 5–12 % on the worklet's own load meter.
* With that much headroom, plain TypeScript in the AudioWorklet is the right
  trade-off. No toolchain, no WASM loading in worklets, one code path for the
  browser, Node tests and offline renders.
* No Rust/Emscripten/wasm-ld is installed on the build machine either. A WASM-SIMD
  port could perhaps give 1.5–3× on the per-string loops, but it is not needed.
* **Structure that makes JS fast.** Strings run in tight per-string block loops,
  and only the junction and soundboard run sample by sample. This works because
  every block (≤ 32 samples) is shorter than the shortest bridge-to-tap distance
  of any active string.
* The worklet measures its own load and sheds sympathetic strings, then
  polyphony, if it runs hot (phones).

## 7. Calibration data

* University of Iowa Musical Instrument Samples:
  * Steinway & Sons model B (211 cm), recorded November 2001;
  * two Neumann KM 84 microphones 8″ above the bass and treble strings;
  * 16-bit/44.1 kHz stereo, input gain unchanged across pp/mf/ff.
* Terms on the MIS page: "may be downloaded and used for any projects, without
  restrictions".
* Used for analysis only, downloaded on demand into a gitignored cache. A few
  labelled excerpts are shipped only for side-by-side listening on the
  measurements page.

## References

* Abel, J. S., Välimäki, V., & Smith, J. O. (2010). Robust, efficient design of allpass filters for dispersive string sound synthesis. *IEEE Signal Processing Letters*, 17(4), 406–409.
* Askenfelt, A., & Jansson, E. V. (1990). From touch to string vibrations. I: Timing in the grand piano action. *JASA*, 88(1), 52–63.
* Askenfelt, A., & Jansson, E. V. (1991). From touch to string vibrations. II: The motion of the key and hammer. *JASA*, 90(5), 2383–2393.
* Bank, B. (2000). *Physics-based sound synthesis of the piano.* M.Sc. thesis, Budapest University of Technology and Economics (Helsinki University of Technology, Laboratory of Acoustics and Audio Signal Processing, Report 54).
* Bank, B., Avanzini, F., Borin, G., De Poli, G., Fontana, F., & Rocchesso, D. (2003). Physically informed signal processing methods for piano sound synthesis: a research overview. *EURASIP Journal on Applied Signal Processing*, 2003(10), 941–952.
* Bank, B., & Sujbert, L. (2005). Generation of longitudinal vibrations in piano strings: From physics to sound synthesis. *JASA*, 117(4), 2268–2278.
* Bank, B., Zambon, S., & Fontana, F. (2010). A modal-based real-time piano synthesizer. *IEEE Transactions on Audio, Speech, and Language Processing*, 18(4), 809–821.
* Bensa, J., Bilbao, S., Kronland-Martinet, R., & Smith, J. O. (2003). The simulation of piano string vibration: From physical models to finite difference schemes and digital waveguides. *JASA*, 114(2), 1095–1107.
* Borin, G., De Poli, G., & Rocchesso, D. (2000). Elimination of delay-free loops in discrete-time models of nonlinear acoustic systems. *IEEE Transactions on Speech and Audio Processing*, 8(5), 597–605.
* Chabassier, J., Chaigne, A., & Joly, P. (2013). Modeling and simulation of a grand piano. *JASA*, 134(1), 648–665.
* Chaigne, A., & Askenfelt, A. (1994). Numerical simulations of piano strings. I. A physical model for a struck string using finite difference methods. *JASA*, 95(2), 1112–1118.
* Conklin, H. A. (1996). Design and tone in the mechanoacoustic piano. Part I: Piano hammers and tonal effects. *JASA*, 99(6), 3286–3296; Part II: Piano structure, *JASA*, 100(2), 695–708; Part III: Piano strings and scale design, *JASA*, 100(3), 1286–1298.
* Conklin, H. A. (1999). Generation of partials due to nonlinear mixing in a stringed instrument. *JASA*, 105(1), 536–545.
* Ege, K., Boutillon, X., & Rébillat, M. (2013). Vibroacoustics of the piano soundboard: (Non)linearity and modal properties in the low- and mid-frequency ranges. *Journal of Sound and Vibration*, 332(5), 1288–1305.
* Fletcher, H. (1964). Normal vibration frequencies of a stiff piano string. *JASA*, 36(1), 203–209.
* Fletcher, N. H., & Rossing, T. D. (1998). *The Physics of Musical Instruments* (2nd ed.). Springer.
* Giordano, N. (1998). Mechanical impedance of a piano soundboard. *JASA*, 103(4), 2128–2133.
* Giordano, N., & Winans, J. P. (2000). Piano hammers and their force compression characteristics: Does a power law make sense? *JASA*, 107(4), 2248–2255.
* Hunt, K. H., & Crossley, F. R. E. (1975). Coefficient of restitution interpreted as damping in vibroimpact. *Journal of Applied Mechanics*, 42(2), 440–445.
* Järveläinen, H., Välimäki, V., & Karjalainen, M. (2001). Audibility of the timbral effects of inharmonicity in stringed instrument tones. *Acoustics Research Letters Online*, 2(3), 79–84.
* Jot, J.-M., & Chaigne, A. (1991). Digital delay networks for designing artificial reverberators. *90th AES Convention*, Paris.
* Laakso, T. I., Välimäki, V., Karjalainen, M., & Laine, U. K. (1996). Splitting the unit delay. *IEEE Signal Processing Magazine*, 13(1), 30–60.
* Lang, M., & Laakso, T. I. (1994). Simple and robust method for the design of allpass filters using least-squares phase error criterion. *IEEE Transactions on Circuits and Systems II*, 41(1), 40–48.
* Lehtonen, H.-M., Penttinen, H., Rauhala, J., & Välimäki, V. (2007). Analysis and modeling of piano sustain-pedal effects. *JASA*, 122(3), 1787–1797.
* Rauhala, J., & Välimäki, V. (2006). Tunable dispersion filter design for piano synthesis. *IEEE Signal Processing Letters*, 13(5), 253–256.
* Rigaud, F., David, B., & Daudet, L. (2013). A parametric model and estimation techniques for the inharmonicity and tuning of the piano. *JASA*, 133(5), 3107–3118.
* Smith, J. O. (1992). Physical modeling using digital waveguides. *Computer Music Journal*, 16(4), 74–91.
* Smith, J. O., & Van Duyne, S. A. (1995). Commuted piano synthesis. *Proc. International Computer Music Conference*, Banff.
* Stulov, A. (1995). Hysteretic model of the grand piano hammer felt. *JASA*, 97(4), 2577–2585.
* Välimäki, V., Pakarinen, J., Erkut, C., & Karjalainen, M. (2006). Discrete-time modelling of musical instruments. *Reports on Progress in Physics*, 69(1), 1–78.
* Van Duyne, S. A., Pierce, J. R., & Smith, J. O. (1994). Traveling wave implementation of a lossless mode-coupling filter and the wave digital hammer. *Proc. ICMC*, Aarhus.
* Van Duyne, S. A., & Smith, J. O. (1994). A simplified approach to modeling dispersion caused by stiffness in strings and plates. *Proc. ICMC*, Aarhus.
* Weinreich, G. (1977). Coupled piano strings. *JASA*, 62(6), 1474–1484.
* Zambon, S., Lehtonen, H.-M., & Bank, B. (2008). Simulation of piano sustain-pedal effect by parallel second-order filters. *Proc. DAFx-08*, Espoo.
