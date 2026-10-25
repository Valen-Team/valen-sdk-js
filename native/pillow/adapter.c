/* Thin RGB storage/allocator adapter around unmodified Pillow Resample.c. */
#include "Imaging.h"
#include <limits.h>
#include <stdlib.h>
#include <string.h>
Imaging ImagingNewDirty(ModeID mode,int width,int height){
 if(mode!=IMAGING_MODE_RGB||width<=0||height<=0||width>INT_MAX/4||height>INT_MAX/(width*4))return NULL;
 Imaging im=calloc(1,sizeof(*im));if(!im)return NULL;
 im->mode=mode;im->type=IMAGING_TYPE_UINT8;im->bands=3;im->xsize=width;im->ysize=height;im->pixelsize=4;im->linesize=width*4;
 im->block=malloc((size_t)im->linesize*height);im->image=malloc(sizeof(char*)*height);
 if(!im->block||!im->image){free(im->block);free(im->image);free(im);return NULL;}
 for(int y=0;y<height;++y)im->image[y]=im->block+(size_t)y*im->linesize;
 im->image32=(INT32**)im->image;return im;
}
void ImagingDelete(Imaging im){if(im){free(im->block);free(im->image);free(im);}}
Imaging ImagingCopy(Imaging input){Imaging out=ImagingNewDirty(input->mode,input->xsize,input->ysize);if(out)memcpy(out->block,input->block,(size_t)input->linesize*input->ysize);return out;}
void ImagingSectionEnter(ImagingSectionCookie* cookie){(void)cookie;}
void ImagingSectionLeave(ImagingSectionCookie* cookie){(void)cookie;}
void* ImagingError_MemoryError(void){return NULL;}
void* ImagingError_ModeError(void){return NULL;}
void* ImagingError_ValueError(const char* message){(void)message;return NULL;}
void ImagingCopyPalette(Imaging output,Imaging input){(void)output;(void)input;}
#include "nearest.inc"
int pillow_resize(const unsigned char* input,int width,int height,unsigned char* output,int out_width,int out_height,int filter){
 if(width<=0||height<=0||out_width<=0||out_height<=0)return 0;
 Imaging im=ImagingNewDirty(IMAGING_MODE_RGB,width,height);if(!im)return 0;
 for(int y=0;y<height;++y)for(int x=0;x<width;++x){unsigned char* p=(unsigned char*)im->image[y]+x*4;const unsigned char* s=input+((size_t)y*width+x)*3;p[0]=s[0];p[1]=s[1];p[2]=s[2];p[3]=0;}
 float box[4]={0,0,(float)width,(float)height};Imaging resized;
 if(filter==0){double matrix[6]={(double)width/out_width,0,0,0,(double)height/out_height,0};resized=ImagingNewDirty(IMAGING_MODE_RGB,out_width,out_height);if(resized&&ImagingScaleAffine(resized,im,0,0,out_width,out_height,matrix,1)){ImagingDelete(resized);resized=NULL;}}
 else resized=ImagingResample(im,out_width,out_height,filter,box);
 if(!resized){ImagingDelete(im);return 0;}
 for(int y=0;y<out_height;++y)for(int x=0;x<out_width;++x){const unsigned char* s=(const unsigned char*)resized->image[y]+x*4;unsigned char* d=output+((size_t)y*out_width+x)*3;d[0]=s[0];d[1]=s[1];d[2]=s[2];}
 ImagingDelete(im);ImagingDelete(resized);return 1;
}
