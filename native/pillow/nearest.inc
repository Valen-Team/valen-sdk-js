/* Unmodified Pillow 13.0 ImagingScaleAffine; see PILLOW-LICENSE.txt. */
#define COORD(v) ((v) < 0.0 ? -1 : ((int)(v)))
static int
ImagingScaleAffine(
    Imaging imOut, Imaging imIn, int x0, int y0, int x1, int y1, double a[6], int fill
) {
    /* scale, nearest neighbour resampling */

    ImagingSectionCookie cookie;
    int x, y;
    int xin;
    double xo, yo;
    int xmin, xmax;
    int *xintab;

    if (!imOut || !imIn || imIn->mode != imOut->mode) {
        ImagingError_ModeError();
        return -1;
    }

    ImagingCopyPalette(imOut, imIn);

    if (x0 < 0) {
        x0 = 0;
    }
    if (y0 < 0) {
        y0 = 0;
    }

    int in_xsize = imIn->xsize, in_ysize = imIn->ysize;
    int out_xsize = imOut->xsize, out_ysize = imOut->ysize;
    if (x1 > out_xsize) {
        x1 = out_xsize;
    }
    if (y1 > out_ysize) {
        y1 = out_ysize;
    }

    /* malloc check ok, uses calloc for overflow */
    xintab = (int *)calloc(out_xsize, sizeof(int));
    if (!xintab) {
        ImagingError_MemoryError();
        return -1;
    }

    xo = a[2] + a[0] * 0.5;
    yo = a[5] + a[4] * 0.5;

    xmin = x1;
    xmax = x0;

    /* Pretabulate horizontal pixel positions */
    for (x = x0; x < x1; x++) {
        xin = COORD(xo);
        if (xin >= 0 && xin < (int)in_xsize) {
            xmax = x + 1;
            if (x < xmin) {
                xmin = x;
            }
            xintab[x] = xin;
        }
        xo += a[0];
    }

#define AFFINE_SCALE(pixel, image)                          \
    for (y = y0; y < y1; y++) {                             \
        int yi = COORD(yo);                                 \
        pixel *in, *out;                                    \
        out = imOut->image[y];                              \
        if (fill && x1 > x0) {                              \
            memset(out + x0, 0, (x1 - x0) * sizeof(pixel)); \
        }                                                   \
        if (yi >= 0 && yi < in_ysize) {                     \
            in = imIn->image[yi];                           \
            for (x = xmin; x < xmax; x++) {                 \
                out[x] = in[xintab[x]];                     \
            }                                               \
        }                                                   \
        yo += a[4];                                         \
    }

    ImagingSectionEnter(&cookie);
    MUTEX_LOCK(&imIn->mutex);

    if (imIn->image8) {
        AFFINE_SCALE(UINT8, image8);
    } else {
        AFFINE_SCALE(INT32, image32);
    }

    MUTEX_UNLOCK(&imIn->mutex);
    ImagingSectionLeave(&cookie);

#undef AFFINE_SCALE

    free(xintab);

    return 0;
}

