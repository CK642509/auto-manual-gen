# Adding a Camera

This chapter explains how to create a camera in DemoStreamApp and enter its RTSP URL.

<!-- protected:start -->
> Important: Once a camera is created with inference enabled, it continuously records and analyzes images of people in its view. Before adding a camera, make sure that surveillance notices are posted at the installation site as required by local laws and site regulations, and that you have the consent of the site manager. The installer is solely responsible for any legal consequences of collecting images without consent.
<!-- protected:end -->

## Steps

1. Wait for the **Cameras** list on the left to finish loading.
2. Click **Add Camera** in the upper-right corner of the list.

{{screenshot:camera-add-01}}

3. In **{{legend.name}}**, type **Gate West**.
4. In **{{legend.source}}**, type **rtsp://192.0.2.10/live**.

{{screenshot:camera-add-02}}

5. Click **{{legend.confirm}}**.

{{screenshot:camera-add-03}}

## Result

The notification **Camera "Gate West" created** appears, which means the camera has been created.

**{{legend.zone}}** defaults to **Main Gate**, and **{{legend.enabled}}** is on by default. This example does not change either of them.

> Note: While **{{legend.name}}** is empty, **{{legend.confirm}}** cannot be clicked.
