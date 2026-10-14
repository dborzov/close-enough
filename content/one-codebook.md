---
title: One codebook, and the wall
kicker: Vector quantization
goal: If you had to compress vectors with no prior reading, you would probably invent this. Here is exactly why it cannot reach 16 bytes.
---

## Replace each vector by its nearest representative

Pick $K$ representative vectors, the [codebook]{.def .k-book} $\{\kbook{c_1},\dots,\kbook{c_K}\}$. Replace each data point by the *index* of its nearest representative.

- **Store** the index, the [code]{.def .k-code}: $\log_2 K$ bits.
- **Decode** by looking the index up.
- **Train** with [[k-means]], which finds the representatives that minimise squared error.

This is [[vector quantization]] (VQ).

::: widget vq | One codebook: bits against error
**Slide the bits** Each extra bit doubles $K$. On the right, error on a log scale. In two dimensions each bit roughly halves the error once $K$ is large; the dashed line is that slope.
:::

```python VQ in numpy: encode = nearest neighbour, decode = lookup | numpy
def nearest(X, C):
    # ||x-c||² = ||x||² - 2x·c + ||c||²; drop ||x||², it doesn't move the argmin
    return (-2 * X @ C.T + (C ** 2).sum(1)).argmin(1)

codes = nearest(X, C)      # encode: log2(K) bits per row
X_hat = C[codes]           # decode: a table lookup
```

## The wall: bits per *dimension*

The right-hand plot hides a law. With a good codebook, distortion falls exponentially with the rate $R$ in bits per vector, but **the exponent is divided by the dimension**:

$$ \kres{D}(R) \;\approx\; c \cdot 2^{-2\,\kbits{R}/d} $$

::: aside Same law, different clothes
This is the vector form of "6 dB per bit" from [[@scalar-quantization]]: one bit *per dimension* buys a factor of 4 in squared error. It returns in [[@bit-allocation]], where it says what lossless compression can save.
:::

In two dimensions, one bit halves the error, which is what you saw. Now put in Marginalia's $d = {{d}}$:

- one bit shrinks the error by $2^{-2/{{d}}} \approx 0.996$;
- getting anywhere useful takes dozens of bits per vector;
- dozens of bits means $K = 2^{64}$ or more.

A codebook that size:

- cannot be **stored**{.k-book} (18 quintillion vectors);
- cannot be **trained**{.k-book} (k-means needs many more points than centroids);
- cannot be **searched**{.k-enc} when encoding (finding the nearest of $2^{64}$ entries is the very problem we were trying to make cheap).

```score VQ, SMALL K
bad distortion | high
ok encode | K·d
good decode | one lookup
bad huge K | impossible
```

::: pull
Can we have a gigantic codebook without storing it, and still find good entries in it?

The question that drives the rest of this part.
:::

::: check
- VQ: k-means centroids as a codebook, the nearest centroid's index as the code.
- Distortion falls like $2^{-2R/d}$: high dimension needs astronomically many codewords.
- A huge codebook breaks storage, training and encoding all at once.
:::
